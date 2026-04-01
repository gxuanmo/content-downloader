import 'server-only';

import { spawn } from 'child_process';

type RawYtDlpFormat = {
  url?: string;
  ext?: string;
  height?: number;
  width?: number;
  abr?: number;
  tbr?: number;
  vcodec?: string;
  acodec?: string;
};

type RawYtDlpEntry = {
  id?: string;
  title?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  creator?: string;
  webpage_url?: string;
  original_url?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string }>;
  duration?: number;
  duration_string?: string;
  ext?: string;
  url?: string;
  formats?: RawYtDlpFormat[];
  entries?: RawYtDlpEntry[];
};

const PYTHON_CANDIDATES = [
  { command: 'python', args: ['-m', 'yt_dlp'] },
  { command: 'py', args: ['-m', 'yt_dlp'] },
];

function runYtDlp(command: string, baseArgs: string[], url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      command,
      [
        ...baseArgs,
        '--dump-single-json',
        '--skip-download',
        '--no-warnings',
        '--no-playlist',
        '--ignore-config',
        url,
      ],
      {
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('yt-dlp 解析超时'));
    }, 45000);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (code === 0 && stdout.trim()) {
        resolve(stdout);
        return;
      }

      reject(new Error(stderr.trim() || `yt-dlp 退出码 ${code}`));
    });
  });
}

function scoreFormat(format: RawYtDlpFormat): number {
  let score = 0;

  if (format.vcodec && format.vcodec !== 'none') score += 50;
  if (format.acodec && format.acodec !== 'none') score += 30;
  if (format.ext === 'mp4') score += 10;
  if (format.ext === 'm4a') score += 8;
  score += format.height || 0;
  score += Math.round(format.tbr || 0);
  score += Math.round(format.abr || 0);

  return score;
}

function flattenEntry(entry: RawYtDlpEntry): RawYtDlpEntry {
  if (Array.isArray(entry.entries) && entry.entries.length > 0) {
    const firstEntry = entry.entries.find((item) => item && (item.url || item.formats?.length)) || entry.entries[0];
    if (firstEntry) {
      return {
        ...entry,
        ...firstEntry,
        title: firstEntry.title || entry.title,
        description: firstEntry.description || entry.description,
        uploader: firstEntry.uploader || entry.uploader,
        channel: firstEntry.channel || entry.channel,
        creator: firstEntry.creator || entry.creator,
        thumbnail: firstEntry.thumbnail || entry.thumbnail,
        thumbnails: firstEntry.thumbnails || entry.thumbnails,
        webpage_url: firstEntry.webpage_url || entry.webpage_url,
        original_url: firstEntry.original_url || entry.original_url,
      };
    }
  }

  return entry;
}

function pickBestUrl(entry: RawYtDlpEntry): string | undefined {
  if (entry.url) {
    return entry.url;
  }

  if (!Array.isArray(entry.formats) || entry.formats.length === 0) {
    return undefined;
  }

  const formats = entry.formats
    .filter((format) => typeof format.url === 'string')
    .sort((left, right) => scoreFormat(right) - scoreFormat(left));

  return formats[0]?.url;
}

export async function extractWithYtDlp(url: string): Promise<RawYtDlpEntry> {
  let lastError: Error | null = null;

  for (const candidate of PYTHON_CANDIDATES) {
    try {
      const stdout = await runYtDlp(candidate.command, candidate.args, url);
      return flattenEntry(JSON.parse(stdout) as RawYtDlpEntry);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('yt-dlp 调用失败');
    }
  }

  throw new Error(
    lastError?.message.includes('No module named yt_dlp')
      ? '当前环境未安装 yt-dlp，请先执行: python -m pip install yt-dlp'
      : lastError?.message || 'yt-dlp 调用失败'
  );
}

export function pickYtDlpDownloadUrl(entry: RawYtDlpEntry): string | undefined {
  return pickBestUrl(entry) || entry.webpage_url || entry.original_url;
}

export function pickYtDlpAuthor(entry: RawYtDlpEntry): string | undefined {
  return entry.uploader || entry.channel || entry.creator;
}

export function pickYtDlpThumbnail(entry: RawYtDlpEntry): string | undefined {
  return entry.thumbnail || entry.thumbnails?.find((item) => item?.url)?.url;
}

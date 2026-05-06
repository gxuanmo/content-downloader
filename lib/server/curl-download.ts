import 'server-only';

import { mkdtemp, readFile, rm, stat } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { spawn } from 'child_process';

import { resolveSafeAddress } from './remote-url';

function getCurlCommand() {
  return process.platform === 'win32' ? 'curl.exe' : 'curl';
}

interface CurlResult {
  statusCode: number;
  contentType: string;
}

function runCurl(
  url: string,
  outFile: string,
  resolveOverride: string | undefined,
  referer: string | undefined,
  maxBytes: number
): Promise<CurlResult> {
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--connect-timeout',
      '30',
      '--retry',
      '2',
      '--max-redirs',
      '0',
      '--max-filesize',
      String(maxBytes),
      '--user-agent',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      '--write-out',
      '%{http_code}\n%{content_type}',
      '--output',
      outFile,
    ];

    if (resolveOverride) {
      args.push('--resolve', resolveOverride);
    }

    if (referer) {
      args.push('--referer', referer);
    }

    args.push(url);

    const child = spawn(getCurlCommand(), args, {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl 下载失败，退出码 ${code}`));
        return;
      }
      const [codeLine = '', ctLine = ''] = stdout.split('\n');
      resolve({ statusCode: Number(codeLine.trim()) || 0, contentType: ctLine.trim() });
    });
  });
}

export async function downloadWithCurl(rawUrl: string, referer: string | undefined, maxBytes: number): Promise<Buffer> {
  const { url, address } = await resolveSafeAddress(rawUrl);
  const port = url.port || (url.protocol === 'https:' ? '443' : '80');
  const resolveOverride = `${url.hostname}:${port}:${address}`;

  const tempDir = await mkdtemp(join(tmpdir(), 'content-downloader-'));
  const outFile = join(tempDir, 'download.bin');

  try {
    const { statusCode, contentType } = await runCurl(url.toString(), outFile, resolveOverride, referer, maxBytes);
    if (statusCode < 200 || statusCode >= 300) {
      throw new Error(`上游返回 ${statusCode}，已拒绝（不跟随重定向）`);
    }
    if (contentType.toLowerCase().includes('text/html')) {
      throw new Error('上游返回的是 HTML 页面，不是可下载的媒体文件');
    }
    const info = await stat(outFile);
    if (info.size > maxBytes) {
      throw new Error(`下载体积超过限制 (${maxBytes} 字节)`);
    }
    return await readFile(outFile);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

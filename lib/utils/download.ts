import sanitizeFilename from 'sanitize-filename';
import { saveAs } from 'file-saver';

import { DownloadItem } from '@/types';

const DEFAULT_EXTENSION_BY_TYPE: Record<DownloadItem['fileType'], string> = {
  markdown: 'md',
  audio: 'mp3',
  video: 'mp4',
  image: 'jpg',
};

function buildTextBlob(content: string) {
  return new Blob([content], { type: 'text/plain;charset=utf-8' });
}

export function buildSafeFilename(title: string, extension: string) {
  const safeName = sanitizeFilename(title).trim() || 'download';
  return `${safeName}.${extension}`;
}

export function getDownloadFilename(item: DownloadItem) {
  const extension = item.extension || DEFAULT_EXTENSION_BY_TYPE[item.fileType] || 'bin';
  return buildSafeFilename(item.title, extension);
}

async function parseDownloadError(response: Response) {
  try {
    const data = await response.json();
    return typeof data?.error === 'string' ? data.error : '下载失败';
  } catch {
    return '下载失败';
  }
}

export async function fetchRemoteItemBlob(item: DownloadItem): Promise<{ blob: Blob; filename: string }> {
  if (!item.downloadUrl) {
    throw new Error('当前结果没有可下载的媒体链接');
  }

  const filename = getDownloadFilename(item);
  const response = await fetch('/api/download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      downloadUrl: item.downloadUrl,
      filename,
      extension: item.extension,
      platform: item.platform,
    }),
  });

  if (!response.ok) {
    throw new Error(await parseDownloadError(response));
  }

  return {
    blob: await response.blob(),
    filename,
  };
}

export async function downloadResolvedItem(item: DownloadItem): Promise<void> {
  if (item.content) {
    saveAs(new Blob([item.content], { type: 'text/markdown;charset=utf-8' }), getDownloadFilename(item));
    return;
  }

  if (item.downloadUrl) {
    const { blob, filename } = await fetchRemoteItemBlob(item);
    saveAs(blob, filename);
    return;
  }

  const fallback = [
    `标题：${item.title}`,
    `平台：${item.platform}`,
    `原链接：${item.url}`,
    item.error ? `错误：${item.error}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  saveAs(buildTextBlob(fallback), getDownloadFilename({ ...item, extension: 'txt', fileType: 'markdown' }));
}

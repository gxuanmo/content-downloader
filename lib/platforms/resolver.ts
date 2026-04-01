import { BatchResolveResponse, DownloadItem, ResolveResponse } from '@/types';

export async function resolveUrl(url: string): Promise<DownloadItem> {
  const response = await fetch('/api/resolve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });

  const data = (await response.json()) as ResolveResponse;

  if (!response.ok || !data.success || !data.data) {
    throw new Error(data.error || '解析失败');
  }

  return data.data;
}

export async function resolveBatchUrls(urls: string[]): Promise<DownloadItem[]> {
  const response = await fetch('/api/resolve/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  });

  const data = (await response.json()) as BatchResolveResponse;

  if (!response.ok || !data.success || !data.data) {
    throw new Error(data.error || '批量解析失败');
  }

  return data.data;
}

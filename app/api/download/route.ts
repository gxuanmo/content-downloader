import { NextRequest, NextResponse } from 'next/server';
import sanitizeFilename from 'sanitize-filename';
import { Agent } from 'undici';

import { downloadWithCurl } from '@/lib/server/curl-download';
import { assertSafeRemoteUrl } from '@/lib/server/remote-url';
import { PlatformType } from '@/types';

export const runtime = 'nodejs';

const downloadDispatcher = new Agent({
  connect: {
    timeout: 30000,
    family: 4,
  },
});

const PLATFORM_REFERERS: Partial<Record<PlatformType, string>> = {
  bilibili: 'https://www.bilibili.com/',
  douyin: 'https://www.douyin.com/',
  kuaishou: 'https://www.kuaishou.com/',
  tiktok: 'https://www.tiktok.com/',
  xiaohongshu: 'https://www.xiaohongshu.com/',
  x: 'https://x.com/',
  youtube: 'https://www.youtube.com/',
  videohao: 'https://channels.weixin.qq.com/',
  wechat: 'https://mp.weixin.qq.com/',
};

function inferContentTypeFromExtension(extension?: string) {
  switch ((extension || '').toLowerCase()) {
    case 'mp4':
      return 'video/mp4';
    case 'm3u8':
      return 'application/vnd.apple.mpegurl';
    case 'mp3':
      return 'audio/mpeg';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function buildAttachmentFilename(filename: string) {
  const safe = sanitizeFilename(filename).trim() || 'download.bin';
  const encoded = encodeURIComponent(safe);
  return {
    safe,
    header: `attachment; filename="${safe}"; filename*=UTF-8''${encoded}`,
  };
}

async function fetchWithFallback(url: URL, platform: PlatformType, contentTypeHint: string) {
  try {
    const requestInit: RequestInit & { dispatcher: Agent } = {
      method: 'GET',
      redirect: 'follow',
      cache: 'no-store',
      dispatcher: downloadDispatcher,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...(PLATFORM_REFERERS[platform] ? { Referer: PLATFORM_REFERERS[platform] as string } : {}),
      },
    };

    const response = await fetch(url, requestInit);

    if (!response.ok || !response.body) {
      throw new Error(`下载失败 (${response.status})`);
    }

    const contentType = response.headers.get('content-type') || contentTypeHint;

    if (contentType.toLowerCase().includes('text/html')) {
      throw new Error('上游返回的是 HTML 页面，不是可下载的媒体文件');
    }

    return {
      kind: 'stream' as const,
      body: response.body,
      contentType,
    };
  } catch {
    const buffer = await downloadWithCurl(url.toString(), PLATFORM_REFERERS[platform]);

    return {
      kind: 'buffer' as const,
      body: buffer,
      contentType: contentTypeHint,
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const downloadUrl = typeof body?.downloadUrl === 'string' ? body.downloadUrl.trim() : '';
    const filename = typeof body?.filename === 'string' ? body.filename.trim() : 'download.bin';
    const extension = typeof body?.extension === 'string' ? body.extension.trim() : '';
    const platform = typeof body?.platform === 'string' ? (body.platform as PlatformType) : 'unknown';

    if (!downloadUrl) {
      return NextResponse.json(
        { success: false, error: '缺少下载链接' },
        { status: 400 }
      );
    }

    const safeUrl = await assertSafeRemoteUrl(downloadUrl);
    const disposition = buildAttachmentFilename(filename);

    const contentTypeHint = inferContentTypeFromExtension(extension);
    const upstream = await fetchWithFallback(safeUrl, platform, contentTypeHint);
    const responseBody =
      upstream.kind === 'buffer' ? new Uint8Array(upstream.body) : upstream.body;

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        'Content-Type': upstream.contentType,
        'Content-Disposition': disposition.header,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? [error.message, error.cause instanceof Error ? error.cause.message : '']
            .filter(Boolean)
            .join(': ')
        : '下载失败';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

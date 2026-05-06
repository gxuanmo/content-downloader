import { NextRequest, NextResponse } from 'next/server';
import sanitizeFilename from 'sanitize-filename';
import { Agent } from 'undici';

import { downloadWithCurl } from '@/lib/server/curl-download';
import { RemoteUrlError, assertSafeRemoteUrl, createSafeLookup } from '@/lib/server/remote-url';
import { PlatformType } from '@/types';

export const runtime = 'nodejs';

const MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const downloadDispatcher = new Agent({
  connect: {
    timeout: 30000,
    lookup: createSafeLookup(),
  },
});

class HtmlResponseError extends Error {
  constructor() {
    super('上游返回的是 HTML 页面，不是可下载的媒体文件');
    this.name = 'HtmlResponseError';
  }
}

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

function limitedStream(source: ReadableStream<Uint8Array>, limit: number): ReadableStream<Uint8Array> {
  let received = 0;
  const reader = source.getReader();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await reader.read();
        if (done) {
          controller.close();
          return;
        }
        received += value.byteLength;
        if (received > limit) {
          controller.error(new Error(`下载体积超过限制 (${limit} 字节)`));
          await reader.cancel();
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await reader.cancel(reason);
    },
  });
}

async function discardBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {}
}

async function fetchFollowingRedirects(initialUrl: URL, platform: PlatformType) {
  let currentUrl = initialUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const requestInit: RequestInit & { dispatcher: Agent } = {
      method: 'GET',
      redirect: 'manual',
      cache: 'no-store',
      dispatcher: downloadDispatcher,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        ...(PLATFORM_REFERERS[platform] ? { Referer: PLATFORM_REFERERS[platform] as string } : {}),
      },
    };

    const response = await fetch(currentUrl, requestInit);

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        await discardBody(response);
        throw new Error(`上游返回 ${response.status} 但缺少 Location 头`);
      }

      const nextUrl = new URL(location, currentUrl);
      try {
        currentUrl = await assertSafeRemoteUrl(nextUrl.toString());
      } catch (error) {
        await discardBody(response);
        throw error;
      }
      await discardBody(response);
      continue;
    }

    if (!response.ok || !response.body) {
      await discardBody(response);
      throw new Error(`下载失败 (${response.status})`);
    }

    return response;
  }

  throw new Error('重定向次数超过限制');
}

async function fetchWithFallback(url: URL, platform: PlatformType, contentTypeHint: string) {
  try {
    const response = await fetchFollowingRedirects(url, platform);

    const contentType = response.headers.get('content-type') || contentTypeHint;
    if (contentType.toLowerCase().includes('text/html')) {
      await discardBody(response);
      throw new HtmlResponseError();
    }

    const contentLength = Number(response.headers.get('content-length') || '0');
    if (contentLength > MAX_DOWNLOAD_BYTES) {
      await discardBody(response);
      throw new Error(`下载体积超过限制 (${MAX_DOWNLOAD_BYTES} 字节)`);
    }

    return {
      kind: 'stream' as const,
      body: limitedStream(response.body!, MAX_DOWNLOAD_BYTES),
      contentType,
    };
  } catch (error) {
    if (error instanceof HtmlResponseError) {
      throw error;
    }
    try {
      const buffer = await downloadWithCurl(url.toString(), PLATFORM_REFERERS[platform], MAX_DOWNLOAD_BYTES);
      return {
        kind: 'buffer' as const,
        body: buffer,
        contentType: contentTypeHint,
      };
    } catch (curlError) {
      const primary = error instanceof Error ? error.message : String(error);
      const fallback = curlError instanceof Error ? curlError.message : String(curlError);
      throw new Error(`下载失败：${primary}；curl 兜底也失败：${fallback}`);
    }
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
    if (error instanceof RemoteUrlError || error instanceof TypeError) {
      const message = error instanceof Error ? error.message : '请求参数无效';
      return NextResponse.json(
        { success: false, error: message },
        { status: 400 }
      );
    }
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

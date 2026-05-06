import { NextRequest, NextResponse } from 'next/server';

import { buildFailedItem, resolveDownloadItem } from '@/lib/server/resolver';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const urls = Array.isArray(body?.urls)
      ? body.urls
          .filter((item: unknown): item is string => typeof item === 'string')
          .map((item: string) => item.trim())
          .filter((item: string) => item.length > 0)
      : [];

    if (urls.length === 0) {
      return NextResponse.json(
        { success: false, error: '请至少提供一个链接' },
        { status: 400 }
      );
    }

    if (urls.length > 20) {
      return NextResponse.json(
        { success: false, error: '批量解析最多支持 20 个链接' },
        { status: 400 }
      );
    }

    const results = [];

    for (const url of urls) {
      try {
        const item = await resolveDownloadItem(url);
        results.push(item);
      } catch (error) {
        const message = error instanceof Error ? error.message : '解析失败';
        results.push(buildFailedItem(url, message));
      }
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: '请求体不是有效的 JSON' },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : '服务器内部错误';
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}

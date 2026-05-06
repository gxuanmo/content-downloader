import { NextRequest, NextResponse } from 'next/server';

import { ResolveValidationError, resolveDownloadItem } from '@/lib/server/resolver';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少 URL 参数' },
        { status: 400 }
      );
    }

    const item = await resolveDownloadItem(url);
    return NextResponse.json({ success: true, data: item });
  } catch (error) {
    if (error instanceof ResolveValidationError) {
      return NextResponse.json(
        { success: false, error: error.message },
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

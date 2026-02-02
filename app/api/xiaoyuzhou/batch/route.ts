import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { urls } = body;

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      return NextResponse.json(
        { success: false, error: '缺少URL列表' },
        { status: 400 }
      );
    }

    if (urls.length > 10) {
      return NextResponse.json(
        { success: false, error: '批量下载最多支持10个链接' },
        { status: 400 }
      );
    }

    // 串行处理，避免并发过多
    const results = [];
    for (const url of urls) {
      try {
        // 调用单个解析API
        const response = await fetch(`${request.nextUrl.origin}/api/xiaoyuzhou`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            results.push(data.data);
          }
        }
      } catch (error) {
        console.error(`Failed to parse ${url}:`, error);
      }
    }

    if (results.length === 0) {
      return NextResponse.json(
        { success: false, error: '所有链接解析失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error) {
    console.error('Xiaoyuzhou batch API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

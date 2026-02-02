import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少URL参数' },
        { status: 400 }
      );
    }

    // 从小宇宙URL中提取episode ID
    const episodeMatch = url.match(/episode\/(\w+)/);
    if (!episodeMatch) {
      return NextResponse.json(
        { success: false, error: '无法识别小宇宙链接格式' },
        { status: 400 }
      );
    }

    const episodeId = episodeMatch[1];

    // 获取小宇宙页面HTML
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: '获取小宇宙页面失败' },
        { status: response.status }
      );
    }

    const html = await response.text();

    // 从页面中提取JSON-LD数据或meta信息
    // 小宇宙的音频链接通常在页面脚本中
    const audioMatch = html.match(/"audio"\s*:\s*{[^}]*"sourceUrl"\s*:\s*"([^"]+)"/);
    const titleMatch = html.match(/<title>([^<]+)<\/title>/);
    const descMatch = html.match(/<meta[^>]*name="description"[^>]*content="([^"]+)"/);
    const imageMatch = html.match(/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/);

    if (!audioMatch) {
      return NextResponse.json(
        { success: false, error: '无法提取音频链接' },
        { status: 500 }
      );
    }

    const result = {
      title: titleMatch ? titleMatch[1].replace(' - 小宇宙', '') : '未知标题',
      description: descMatch ? descMatch[1] : '',
      audioUrl: audioMatch[1].replace(/\\u002F/g, '/'),
      cover: imageMatch ? imageMatch[1] : '',
      duration: extractDuration(html),
      podcastName: extractPodcastName(html),
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Xiaoyuzhou API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

function extractDuration(html: string): string {
  // 尝试从页面中提取时长
  const durationMatch = html.match(/"duration"\s*:\s*(\d+)/);
  if (durationMatch) {
    const seconds = parseInt(durationMatch[1]);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }
  return '未知时长';
}

function extractPodcastName(html: string): string {
  // 尝试提取节目名称
  const podcastMatch = html.match(/"podcastName"\s*:\s*"([^"]+)"/);
  if (podcastMatch) {
    return podcastMatch[1];
  }
  // 备用方案：从页面结构中提取
  const altMatch = html.match(/href="\/podcast\/[^"]+"[^>]*>([^<]+)</);
  return altMatch ? altMatch[1] : '未知节目';
}

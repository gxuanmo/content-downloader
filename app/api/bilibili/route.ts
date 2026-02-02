import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, quality = '720p' } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少URL参数' },
        { status: 400 }
      );
    }

    // 从URL中提取BV号
    const bvMatch = url.match(/BV\w+/);
    const bvid = bvMatch ? bvMatch[0] : null;

    if (!bvid) {
      return NextResponse.json(
        { success: false, error: '无法识别B站BV号' },
        { status: 400 }
      );
    }

    // 获取视频信息
    const infoResponse = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });

    if (!infoResponse.ok) {
      return NextResponse.json(
        { success: false, error: '获取视频信息失败' },
        { status: infoResponse.status }
      );
    }

    const infoData = await infoResponse.json();

    if (infoData.code !== 0) {
      return NextResponse.json(
        { success: false, error: infoData.message || '视频不存在或已删除' },
        { status: 404 }
      );
    }

    const videoInfo = infoData.data;
    const cid = videoInfo.cid;

    // 获取视频下载链接（无需登录，最高720P）
    const playUrl = `https://api.bilibili.com/x/player/playurl?bvid=${bvid}&cid=${cid}&qn=80&fnval=0&fourk=1`;
    
    const playResponse = await fetch(playUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.bilibili.com',
      },
    });

    let videoUrl = '';
    if (playResponse.ok) {
      const playData = await playResponse.json();
      if (playData.code === 0 && playData.data?.durl?.[0]?.url) {
        videoUrl = playData.data.durl[0].url;
      }
    }

    // 格式化时长
    const duration = formatDuration(videoInfo.duration);

    const result = {
      title: videoInfo.title,
      bvid: bvid,
      cover: videoInfo.pic,
      author: videoInfo.owner.name,
      duration: duration,
      videoUrl: videoUrl,
      quality: quality,
    };

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Bilibili API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

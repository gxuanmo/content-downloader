import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url, isAnswer } = body;

    if (!url) {
      return NextResponse.json(
        { success: false, error: '缺少URL参数' },
        { status: 400 }
      );
    }

    // 代理请求到知乎API
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: '知乎API请求失败' },
        { status: response.status }
      );
    }

    const data = await response.json();

    // 处理不同类型的响应
    let result;
    if (isAnswer && data.content) {
      // 单个回答
      result = {
        title: data.question?.title || '知乎回答',
        content: data.content,
        author: data.author?.name || '匿名用户',
        images: extractImages(data.content),
        url: url,
      };
    } else if (data.data && Array.isArray(data.data)) {
      // 回答列表（取第一个）
      const firstAnswer = data.data[0];
      result = {
        title: data.data[0]?.question?.title || '知乎回答',
        content: firstAnswer?.content || '',
        author: firstAnswer?.author?.name || '匿名用户',
        images: extractImages(firstAnswer?.content || ''),
        url: url,
      };
    } else if (data.title && data.content) {
      // 专栏文章
      result = {
        title: data.title,
        content: data.content,
        author: data.author?.name || '匿名作者',
        images: extractImages(data.content),
        url: url,
      };
    } else {
      return NextResponse.json(
        { success: false, error: '无法解析知乎内容' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Zhihu API error:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}

// 从HTML内容中提取图片URL
function extractImages(content: string): string[] {
  const imgRegex = /<img[^>]+src="([^"]+)"/g;
  const images: string[] = [];
  let match;
  
  while ((match = imgRegex.exec(content)) !== null) {
    images.push(match[1]);
  }
  
  return images;
}

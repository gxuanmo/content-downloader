import { BilibiliData } from '@/types';

export async function parseBilibiliVideo(url: string, quality: '720p' | '480p' | '360p' = '720p'): Promise<BilibiliData> {
  try {
    // 通过Next.js API路由代理请求
    const response = await fetch('/api/bilibili', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, quality }),
    });

    if (!response.ok) {
      throw new Error('获取视频内容失败');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '解析失败');
    }

    return data.data;
  } catch (error) {
    console.error('Bilibili parse error:', error);
    throw error;
  }
}

export async function parseBilibiliBatch(urls: string[], quality: '720p' | '480p' | '360p' = '720p'): Promise<BilibiliData[]> {
  try {
    const response = await fetch('/api/bilibili/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls, quality }),
    });

    if (!response.ok) {
      throw new Error('批量获取视频内容失败');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '批量解析失败');
    }

    return data.data;
  } catch (error) {
    console.error('Bilibili batch parse error:', error);
    throw error;
  }
}

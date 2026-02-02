import { XiaoyuzhouData } from '@/types';

export async function parseXiaoyuzhouEpisode(url: string): Promise<XiaoyuzhouData> {
  try {
    // 通过Next.js API路由代理请求
    const response = await fetch('/api/xiaoyuzhou', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error('获取播客内容失败');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '解析失败');
    }

    return data.data;
  } catch (error) {
    console.error('Xiaoyuzhou parse error:', error);
    throw error;
  }
}

export async function parseXiaoyuzhouBatch(urls: string[]): Promise<XiaoyuzhouData[]> {
  try {
    const response = await fetch('/api/xiaoyuzhou/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      throw new Error('批量获取播客内容失败');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '批量解析失败');
    }

    return data.data;
  } catch (error) {
    console.error('Xiaoyuzhou batch parse error:', error);
    throw error;
  }
}

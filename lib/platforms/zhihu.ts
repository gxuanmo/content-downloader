import { ZhihuData } from '@/types';

export async function parseZhihuArticle(url: string): Promise<ZhihuData> {
  try {
    // 从URL中提取文章ID
    const articleMatch = url.match(/article\/(\d+)/);
    const questionMatch = url.match(/question\/(\d+)/);
    const answerMatch = url.match(/answer\/(\d+)/);
    
    let apiUrl: string;
    let isAnswer = false;
    
    if (articleMatch) {
      // 知乎专栏文章
      const articleId = articleMatch[1];
      apiUrl = `https://www.zhihu.com/api/v4/articles/${articleId}`;
    } else if (questionMatch && answerMatch) {
      // 知乎回答
      const answerId = answerMatch[1];
      apiUrl = `https://www.zhihu.com/api/v4/answers/${answerId}?include=content`;
      isAnswer = true;
    } else if (questionMatch) {
      // 知乎问题（取第一个回答）
      const questionId = questionMatch[1];
      apiUrl = `https://www.zhihu.com/api/v4/questions/${questionId}/answers?limit=1&offset=0&include=content`;
    } else {
      throw new Error('不支持的知乎链接格式');
    }

    // 通过Next.js API路由代理请求，解决CORS
    const response = await fetch('/api/zhihu', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: apiUrl, isAnswer }),
    });

    if (!response.ok) {
      throw new Error('获取知乎内容失败');
    }

    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || '解析失败');
    }

    return data.data;
  } catch (error) {
    console.error('Zhihu parse error:', error);
    throw error;
  }
}

// 辅助函数：将HTML转换为Markdown
export function htmlToMarkdown(html: string): string {
  // 简单的HTML到Markdown转换
  let markdown = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '# $1\n\n')
    .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '## $1\n\n')
    .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '### $1\n\n')
    .replace(/<p[^>]*>(.*?)<\/p>/gi, '$1\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em[^>]*>(.*?)<\/em>/gi, '*$1*')
    .replace(/<img[^>]+src="([^"]+)"[^>]*>/gi, '![image]($1)')
    .replace(/<a[^>]+href="([^"]+)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)')
    .replace(/<[^>]+>/g, ''); // 移除剩余标签
  
  return markdown.trim();
}

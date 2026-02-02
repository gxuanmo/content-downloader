import { PlatformType } from '@/types';

const platformPatterns: Record<PlatformType, RegExp> = {
  zhihu: /zhihu\.com\/(question|article|answer|p)/,
  xiaoyuzhou: /xiaoyuzhoufm\.com\/(episode|podcast)/,
  bilibili: /(bilibili\.com\/video|b23\.tv)/,
  unknown: /never-match/,
};

export function detectPlatform(url: string): PlatformType {
  for (const [platform, pattern] of Object.entries(platformPatterns)) {
    if (platform !== 'unknown' && pattern.test(url)) {
      return platform as PlatformType;
    }
  }
  return 'unknown';
}

export function validateURL(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function extractIdFromURL(url: string, platform: PlatformType): string | null {
  try {
    const urlObj = new URL(url);
    
    switch (platform) {
      case 'zhihu': {
        // 知乎文章/回答ID
        const match = url.match(/(\d+)$/);
        return match ? match[1] : null;
      }
      case 'xiaoyuzhou': {
        // 小宇宙episode ID
        const match = url.match(/episode\/(\w+)/);
        return match ? match[1] : null;
      }
      case 'bilibili': {
        // B站BV号或av号
        const bvMatch = url.match(/BV\w+/);
        if (bvMatch) return bvMatch[0];
        const avMatch = url.match(/av(\d+)/);
        if (avMatch) return avMatch[1];
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

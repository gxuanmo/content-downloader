import { describe, expect, it } from 'vitest';

import { detectPlatform, validateURL } from '@/lib/utils/platform-detector';
import { PlatformType } from '@/types';

describe('detectPlatform', () => {
  const cases: Array<[string, string, PlatformType]> = [
    // zhihu
    ['知乎专栏文章', 'https://zhuanlan.zhihu.com/p/625778427', 'zhihu'],
    ['知乎文章 (www)', 'https://www.zhihu.com/article/123', 'zhihu'],
    ['知乎问题', 'https://www.zhihu.com/question/267782048', 'zhihu'],
    ['知乎回答', 'https://www.zhihu.com/question/267782048/answer/3323601780', 'zhihu'],

    // xiaoyuzhou
    ['小宇宙 episode', 'https://www.xiaoyuzhoufm.com/episode/abc123', 'xiaoyuzhou'],
    ['小宇宙 podcast', 'https://xiaoyuzhoufm.com/podcast/abc123', 'xiaoyuzhou'],

    // bilibili
    ['B站视频', 'https://www.bilibili.com/video/BV1GJ411x7h7', 'bilibili'],
    ['B站短链', 'https://b23.tv/abc123', 'bilibili'],

    // douyin
    ['抖音视频', 'https://www.douyin.com/video/123456', 'douyin'],
    ['抖音短链', 'https://v.douyin.com/abc123/', 'douyin'],

    // kuaishou
    ['快手短视频', 'https://www.kuaishou.com/short-video/abc123', 'kuaishou'],
    ['快手图文', 'https://www.kuaishou.com/photo/abc123', 'kuaishou'],
    ['快手短链', 'https://v.kuaishou.com/abc123', 'kuaishou'],

    // videohao
    ['视频号', 'https://channels.weixin.qq.com/video/feed/abc123', 'videohao'],

    // tiktok
    ['TikTok', 'https://www.tiktok.com/@user/video/123456', 'tiktok'],
    ['TikTok短链', 'https://vm.tiktok.com/abc123/', 'tiktok'],

    // xiaohongshu
    ['小红书', 'https://www.xiaohongshu.com/explore/abc123', 'xiaohongshu'],
    ['小红书短链', 'https://xhslink.com/abc123', 'xiaohongshu'],
    ['RedNote', 'https://www.rednote.com/explore/abc', 'xiaohongshu'],

    // wechat
    ['公众号文章', 'https://mp.weixin.qq.com/s/abc123', 'wechat'],

    // x
    ['X推文', 'https://x.com/user/status/123', 'x'],
    ['Twitter', 'https://twitter.com/user/status/123', 'x'],

    // youtube
    ['YouTube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['YouTube短链', 'https://youtu.be/dQw4w9WgXcQ', 'youtube'],

    // unknown
    ['普通网址', 'https://www.example.com/page', 'unknown'],
    ['百度', 'https://www.baidu.com', 'unknown'],
    ['空字符串', '', 'unknown'],
    ['不完整URL', 'douyin.com', 'unknown'],
  ];

  for (const [label, url, expected] of cases) {
    it(`${label} → ${expected}`, () => {
      expect(detectPlatform(url)).toBe(expected);
    });
  }

  it('区分相似域名场景：tiktok.com 而非 douyin', () => {
    // douyin pattern should NOT match tiktok
    expect(detectPlatform('https://www.tiktok.com/@user/video/123')).toBe('tiktok');
  });

  it('bilibili.com 不被误判为其他平台', () => {
    expect(detectPlatform('https://www.bilibili.com/video/BV123')).toBe('bilibili');
  });

  it('youtube 和 youtu.be 同时匹配', () => {
    expect(detectPlatform('https://youtube.com/watch?v=abc')).toBe('youtube');
    expect(detectPlatform('https://youtu.be/abc')).toBe('youtube');
  });
});

describe('validateURL', () => {
  it('接受标准 HTTP URL', () => {
    expect(validateURL('https://example.com')).toBe(true);
  });

  it('接受 HTTP URL', () => {
    expect(validateURL('http://example.com')).toBe(true);
  });

  it('接受带路径的 URL', () => {
    expect(validateURL('https://www.douyin.com/video/123456')).toBe(true);
  });

  it('接受带查询参数的 URL', () => {
    expect(validateURL('https://www.youtube.com/watch?v=abc123')).toBe(true);
  });

  it('拒绝非 URL 字符串', () => {
    expect(validateURL('not-a-url')).toBe(false);
  });

  it('拒绝空字符串', () => {
    expect(validateURL('')).toBe(false);
  });

  it('拒绝纯数字', () => {
    expect(validateURL('12345')).toBe(false);
  });

  it('拒绝无协议的字符串', () => {
    expect(validateURL('www.example.com')).toBe(false);
  });
});

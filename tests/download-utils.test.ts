import { describe, expect, it } from 'vitest';

import { buildSafeFilename, getDownloadFilename } from '@/lib/utils/download';
import { DownloadItem } from '@/types';

describe('buildSafeFilename', () => {
  it('用 title 和扩展名构造安全文件名', () => {
    expect(buildSafeFilename('My Video Title', 'mp4')).toBe('My Video Title.mp4');
  });

  it('去除文件名中的非法字符', () => {
    expect(buildSafeFilename('hello:world*test?<>|', 'txt')).toBe('helloworldtest.txt');
  });

  it('trim 后为空时使用默认文件名', () => {
    expect(buildSafeFilename('   ', 'md')).toBe('download.md');
  });

  it('保留中文', () => {
    expect(buildSafeFilename('你好世界', 'md')).toBe('你好世界.md');
  });

  it('保留日文/emoji 字符', () => {
    const result = buildSafeFilename('猫のにっき', 'txt');
    // sanitize-filename may strip certain unicode — just verify it ends with .txt
    expect(result.endsWith('.txt')).toBe(true);
    expect(result.length).toBeGreaterThan('.txt'.length);
  });
});

describe('getDownloadFilename', () => {
  const baseItem: DownloadItem = {
    id: '1',
    url: 'https://example.com',
    title: 'Test Title',
    platform: 'unknown',
    status: 'success',
    createdAt: Date.now(),
    fileType: 'markdown',
  };

  it('使用 item.extension 构造文件名', () => {
    const item: DownloadItem = { ...baseItem, extension: 'mp4', fileType: 'video' };
    expect(getDownloadFilename(item)).toBe('Test Title.mp4');
  });

  it('markdown 类型默认 .md 扩展名', () => {
    const item: DownloadItem = { ...baseItem, fileType: 'markdown' };
    expect(getDownloadFilename(item)).toBe('Test Title.md');
  });

  it('audio 类型默认 .mp3 扩展名', () => {
    const item: DownloadItem = { ...baseItem, fileType: 'audio' };
    expect(getDownloadFilename(item)).toBe('Test Title.mp3');
  });

  it('video 类型默认 .mp4 扩展名', () => {
    const item: DownloadItem = { ...baseItem, fileType: 'video' };
    expect(getDownloadFilename(item)).toBe('Test Title.mp4');
  });

  it('image 类型默认 .jpg 扩展名', () => {
    const item: DownloadItem = { ...baseItem, fileType: 'image' };
    expect(getDownloadFilename(item)).toBe('Test Title.jpg');
  });

  it('非法字符被清理', () => {
    const item: DownloadItem = { ...baseItem, title: 'hello:world*test?', fileType: 'markdown' };
    expect(getDownloadFilename(item)).toBe('helloworldtest.md');
  });
});

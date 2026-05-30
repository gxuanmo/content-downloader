export type PlatformType =
  | 'zhihu'
  | 'xiaoyuzhou'
  | 'bilibili'
  | 'douyin'
  | 'kuaishou'
  | 'videohao'
  | 'tiktok'
  | 'xiaohongshu'
  | 'wechat'
  | 'x'
  | 'youtube'
  | 'unknown';

export interface DownloadItem {
  id: string;
  platform: PlatformType;
  url: string;
  title: string;
  author?: string;
  thumbnail?: string;
  downloadUrl?: string;
  content?: string;
  duration?: string;
  summary?: string;
  source?: 'api' | 'html' | 'yt-dlp' | 'fallback';
  extension?: string;
  fileType: 'markdown' | 'audio' | 'video' | 'image';
  status: 'success' | 'failed';
  createdAt: number;
  error?: string;
}

export interface ResolveResponse {
  success: boolean;
  data?: DownloadItem;
  error?: string;
}

export interface BatchResolveResponse {
  success: boolean;
  data?: DownloadItem[];
  error?: string;
}

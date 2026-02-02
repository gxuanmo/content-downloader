export type PlatformType = 'zhihu' | 'xiaoyuzhou' | 'bilibili' | 'unknown';

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
  fileType: 'markdown' | 'audio' | 'video' | 'image';
  status: 'success' | 'failed';
  createdAt: number;
  error?: string;
}

export interface BatchJob {
  id: string;
  urls: string[];
  results: DownloadItem[];
  status: 'pending' | 'processing' | 'completed';
  progress: number;
  createdAt: number;
}

export interface ZhihuData {
  title: string;
  content: string;
  author: string;
  images: string[];
  url: string;
}

export interface XiaoyuzhouData {
  title: string;
  description: string;
  audioUrl: string;
  cover: string;
  duration: string;
  podcastName: string;
}

export interface BilibiliData {
  title: string;
  bvid: string;
  cover: string;
  author: string;
  duration: string;
  videoUrl: string;
  quality: string;
}

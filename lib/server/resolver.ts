import 'server-only';

import { Agent } from 'undici';
import { load } from 'cheerio';
import TurndownService from 'turndown';

import { detectPlatform } from '@/lib/utils/platform-detector';
import { DownloadItem, PlatformType } from '@/types';

import { assertSafeRemoteUrl, createSafeLookup } from './remote-url';
import {
  extractWithYtDlp,
  pickYtDlpAuthor,
  pickYtDlpDownloadUrl,
  pickYtDlpThumbnail,
} from './yt-dlp';

const MAX_HTML_REDIRECTS = 5;

const fetchDispatcher = new Agent({
  connect: {
    timeout: 30000,
    lookup: createSafeLookup(),
  },
});

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
});

const DEFAULT_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
};

const PLATFORM_HOST_ALLOWLIST: Record<Exclude<PlatformType, 'unknown'>, string[]> = {
  zhihu: ['zhihu.com', 'www.zhihu.com', 'zhuanlan.zhihu.com'],
  xiaoyuzhou: ['xiaoyuzhoufm.com', 'www.xiaoyuzhoufm.com'],
  bilibili: ['www.bilibili.com', 'b23.tv', 'bilibili.com'],
  douyin: ['www.douyin.com', 'douyin.com', 'v.douyin.com'],
  kuaishou: ['www.kuaishou.com', 'kuaishou.com', 'v.kuaishou.com'],
  videohao: ['channels.weixin.qq.com'],
  tiktok: ['www.tiktok.com', 'tiktok.com', 'vm.tiktok.com', 'vt.tiktok.com'],
  xiaohongshu: ['www.xiaohongshu.com', 'xiaohongshu.com', 'xhslink.com', 'www.rednote.com', 'rednote.com'],
  wechat: ['mp.weixin.qq.com'],
  x: ['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'],
  youtube: ['www.youtube.com', 'youtube.com', 'youtu.be', 'm.youtube.com'],
};

const YT_DLP_PLATFORMS = new Set<PlatformType>([
  'bilibili',
  'douyin',
  'tiktok',
  'xiaohongshu',
  'x',
  'youtube',
]);

function createId() {
  return crypto.randomUUID();
}

function formatDuration(value?: number | string): string | undefined {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (typeof value !== 'number' || Number.isNaN(value) || value <= 0) {
    return undefined;
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function inferExtensionFromUrl(url?: string): string | undefined {
  if (!url) {
    return undefined;
  }

  try {
    const pathname = new URL(url).pathname;
    const match = pathname.match(/\.([a-zA-Z0-9]{2,5})$/);
    return match?.[1]?.toLowerCase();
  } catch {
    return undefined;
  }
}

function cleanText(text?: string | null): string {
  return (text || '').replace(/\s+/g, ' ').trim();
}

function toSummary(text?: string, max = 140): string | undefined {
  const normalized = cleanText(text);
  if (!normalized) {
    return undefined;
  }

  return normalized.length > max ? `${normalized.slice(0, max)}...` : normalized;
}

function buildMarkdownDocument(title: string, body?: string, author?: string, url?: string): string {
  const lines = [`# ${title}`];

  if (author) {
    lines.push('', `作者：${author}`);
  }

  if (url) {
    lines.push('', `原链接：${url}`);
  }

  if (body) {
    lines.push('', body.trim());
  }

  return lines.join('\n');
}

function buildSuccessItem(partial: Omit<DownloadItem, 'id' | 'createdAt' | 'status'>): DownloadItem {
  return {
    id: createId(),
    createdAt: Date.now(),
    status: 'success',
    ...partial,
  };
}

export function buildFailedItem(url: string, message: string): DownloadItem {
  return {
    id: createId(),
    platform: detectPlatform(url),
    url,
    title: '解析失败',
    extension: 'md',
    fileType: 'markdown',
    status: 'failed',
    createdAt: Date.now(),
    error: message,
    content: buildMarkdownDocument('解析失败', message, undefined, url),
  };
}

function isAllowedUrl(url: string, platform: PlatformType): boolean {
  if (platform === 'unknown') {
    return false;
  }

  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return PLATFORM_HOST_ALLOWLIST[platform].some((allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`));
}

async function fetchHtml(url: string) {
  let currentUrl = await assertSafeRemoteUrl(url);

  for (let hop = 0; hop <= MAX_HTML_REDIRECTS; hop += 1) {
    const response = await fetch(currentUrl, {
      headers: DEFAULT_HEADERS,
      redirect: 'manual',
      cache: 'no-store',
      // @ts-expect-error undici dispatcher
      dispatcher: fetchDispatcher,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (!location) {
        throw new Error(`页面请求失败 (${response.status})`);
      }
      currentUrl = await assertSafeRemoteUrl(new URL(location, currentUrl).toString());
      try {
        await response.body?.cancel();
      } catch {}
      continue;
    }

    if (!response.ok) {
      throw new Error(`页面请求失败 (${response.status})`);
    }

    return {
      html: await response.text(),
      finalUrl: currentUrl.toString(),
    };
  }

  throw new Error('页面重定向次数超过限制');
}

function normalizeMaybeUrl(url: string | undefined, baseUrl: string): string | undefined {
  if (!url) {
    return undefined;
  }

  const normalized = url
    .replace(/\\u002F/g, '/')
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .trim();

  try {
    return new URL(normalized, baseUrl).toString();
  } catch {
    return undefined;
  }
}

function extractMeta($: ReturnType<typeof load>, selector: string, attr = 'content'): string | undefined {
  const value = $(selector).attr(attr);
  return cleanText(value);
}

function extractMediaUrl(html: string, $: ReturnType<typeof load>, finalUrl: string): string | undefined {
  const metaCandidates = [
    extractMeta($, 'meta[property="og:video"]'),
    extractMeta($, 'meta[property="og:video:url"]'),
    extractMeta($, 'meta[name="twitter:player:stream"]'),
    $('video source').first().attr('src'),
    $('video').first().attr('src'),
  ];

  for (const candidate of metaCandidates) {
    const normalized = normalizeMaybeUrl(candidate, finalUrl);
    if (normalized) {
      return normalized;
    }
  }

  const regexes = [
    /"playUrl"\s*:\s*"([^"]+)"/i,
    /"playAddr"\s*:\s*"([^"]+)"/i,
    /"play_addr"\s*:\s*{[^}]*"url_list"\s*:\s*\[\s*"([^"]+)"/i,
    /"video_url"\s*:\s*"([^"]+)"/i,
    /"stream_url"\s*:\s*"([^"]+)"/i,
    /"contentUrl"\s*:\s*"([^"]+)"/i,
    /(https?:\\\/\\\/[^"'\\]+\.(?:mp4|m3u8)[^"'\\]*)/i,
    /(https?:\/\/[^"'\\]+\.(?:mp4|m3u8)[^"'\\]*)/i,
  ];

  for (const regex of regexes) {
    const match = html.match(regex);
    const normalized = normalizeMaybeUrl(match?.[1], finalUrl);
    if (normalized) {
      return normalized;
    }
  }

  return undefined;
}

interface ZhihuPayload {
  title?: string;
  content?: string;
  author?: { name?: string };
  question?: { title?: string };
}

interface ZhihuApiResponse extends ZhihuPayload {
  data?: ZhihuPayload[];
}

async function resolveZhihu(url: string): Promise<DownloadItem> {
  const articleMatch = url.match(/(?:article\/|zhuanlan\.zhihu\.com\/p\/|\/p\/)(\d+)/);
  const questionMatch = url.match(/question\/(\d+)/);
  const answerMatch = url.match(/answer\/(\d+)/);

  let apiUrl = '';

  if (articleMatch) {
    apiUrl = `https://www.zhihu.com/api/v4/articles/${articleMatch[1]}`;
  } else if (questionMatch && answerMatch) {
    apiUrl = `https://www.zhihu.com/api/v4/answers/${answerMatch[1]}?include=content,question,author`;
  } else if (questionMatch) {
    apiUrl = `https://www.zhihu.com/api/v4/questions/${questionMatch[1]}/answers?limit=1&offset=0&include=content,question,author`;
  } else {
    throw new Error('暂不支持该知乎链接格式');
  }

  const response = await fetch(apiUrl, {
    headers: {
      ...DEFAULT_HEADERS,
      Accept: 'application/json',
      Referer: 'https://www.zhihu.com/',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`知乎内容请求失败 (${response.status})`);
  }

  const data = (await response.json()) as ZhihuApiResponse;
  const payload: ZhihuPayload = Array.isArray(data.data) ? data.data[0] ?? {} : data;
  const title = payload.title || payload.question?.title || '知乎内容';
  const author = payload.author?.name || '匿名用户';
  const htmlContent = payload.content || '';
  const markdown = turndown.turndown(htmlContent);

  return buildSuccessItem({
    platform: 'zhihu',
    url,
    title,
    author,
    content: markdown || buildMarkdownDocument(title, undefined, author, url),
    summary: toSummary(markdown),
    extension: 'md',
    fileType: 'markdown',
    source: 'api',
  });
}

async function resolveXiaoyuzhou(url: string): Promise<DownloadItem> {
  const { html, finalUrl } = await fetchHtml(url);
  const $ = load(html);

  const audioMatch = html.match(/"audio"\s*:\s*{[^}]*"sourceUrl"\s*:\s*"([^"]+)"/);
  const audioUrl = normalizeMaybeUrl(audioMatch?.[1], finalUrl);
  const title =
    extractMeta($, 'meta[property="og:title"]') ||
    cleanText($('title').text()).replace(/\s*-\s*小宇宙\s*$/, '') ||
    '小宇宙播客';
  const description =
    extractMeta($, 'meta[name="description"]') ||
    extractMeta($, 'meta[property="og:description"]') ||
    undefined;
  const cover = normalizeMaybeUrl(extractMeta($, 'meta[property="og:image"]'), finalUrl);
  const durationMatch = html.match(/"duration"\s*:\s*(\d+)/);
  const podcastMatch = html.match(/"podcastName"\s*:\s*"([^"]+)"/);
  const duration = formatDuration(durationMatch ? Number(durationMatch[1]) : undefined);

  if (!audioUrl) {
    return buildSuccessItem({
      platform: 'xiaoyuzhou',
      url,
      title,
      author: podcastMatch?.[1],
      thumbnail: cover,
      content: buildMarkdownDocument(title, description || '当前页面未暴露可直接下载的音频链接。', podcastMatch?.[1], finalUrl),
      duration,
      summary: toSummary(description),
      extension: 'md',
      fileType: 'markdown',
      source: 'html',
    });
  }

  return buildSuccessItem({
    platform: 'xiaoyuzhou',
    url,
    title,
    author: podcastMatch?.[1],
    thumbnail: cover,
    downloadUrl: audioUrl,
    duration,
    summary: toSummary(description),
    extension: inferExtensionFromUrl(audioUrl) || 'mp3',
    fileType: 'audio',
    source: 'html',
  });
}

async function resolveWechatArticle(url: string): Promise<DownloadItem> {
  const { html, finalUrl } = await fetchHtml(url);
  const $ = load(html);

  const contentRoot = $('#js_content').length ? $('#js_content') : $('.rich_media_content').first();

  contentRoot.find('script, style, iframe, .js_ad_link, .original_primary_card_tips').remove();

  const title =
    cleanText($('#activity-name').text()) ||
    extractMeta($, 'meta[property="og:title"]') ||
    cleanText($('title').text()) ||
    '公众号文章';
  const author =
    cleanText($('#js_name').text()) ||
    extractMeta($, 'meta[name="author"]') ||
    undefined;
  const htmlContent = contentRoot.html() || '';
  const markdownBody = htmlContent ? turndown.turndown(htmlContent) : '';
  const description =
    extractMeta($, 'meta[property="og:description"]') ||
    extractMeta($, 'meta[name="description"]') ||
    markdownBody;
  const cover = normalizeMaybeUrl(extractMeta($, 'meta[property="og:image"]'), finalUrl);

  return buildSuccessItem({
    platform: 'wechat',
    url,
    title,
    author,
    thumbnail: cover,
    content: buildMarkdownDocument(title, markdownBody, author, finalUrl),
    summary: toSummary(description),
    extension: 'md',
    fileType: 'markdown',
    source: 'html',
  });
}

async function resolvePageFallback(url: string, platform: PlatformType): Promise<DownloadItem> {
  const { html, finalUrl } = await fetchHtml(url);
  const $ = load(html);

  const title =
    extractMeta($, 'meta[property="og:title"]') ||
    extractMeta($, 'meta[name="twitter:title"]') ||
    cleanText($('title').text()) ||
    '内容解析结果';
  const description =
    extractMeta($, 'meta[property="og:description"]') ||
    extractMeta($, 'meta[name="description"]') ||
    extractMeta($, 'meta[name="twitter:description"]') ||
    '';
  const thumbnail =
    normalizeMaybeUrl(extractMeta($, 'meta[property="og:image"]'), finalUrl) ||
    normalizeMaybeUrl(extractMeta($, 'meta[name="twitter:image"]'), finalUrl);
  const mediaUrl = extractMediaUrl(html, $, finalUrl);

  if (mediaUrl) {
    return buildSuccessItem({
      platform,
      url,
      title,
      thumbnail,
      downloadUrl: mediaUrl,
      summary: toSummary(description),
      extension: inferExtensionFromUrl(mediaUrl) || 'mp4',
      fileType: 'video',
      source: 'fallback',
    });
  }

  return buildSuccessItem({
    platform,
    url,
    title,
    thumbnail,
    content: buildMarkdownDocument(title, description || '当前页面未暴露可直接下载的媒体直链。', undefined, finalUrl),
    summary: toSummary(description),
    extension: 'md',
    fileType: 'markdown',
    source: 'fallback',
  });
}

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'm4a', 'aac', 'wav', 'ogg', 'flac']);

function classifyMedia(extension: string | undefined): { extension: string; fileType: DownloadItem['fileType'] } {
  const ext = (extension || '').toLowerCase();
  if (IMAGE_EXTENSIONS.has(ext)) return { extension: ext, fileType: 'image' };
  if (AUDIO_EXTENSIONS.has(ext)) return { extension: ext, fileType: 'audio' };
  return { extension: ext || 'mp4', fileType: 'video' };
}

async function resolveViaYtDlp(url: string, platform: PlatformType): Promise<DownloadItem> {
  const entry = await extractWithYtDlp(url);
  const title = entry.title || '内容解析结果';
  const author = pickYtDlpAuthor(entry);
  const thumbnail = pickYtDlpThumbnail(entry);
  const downloadUrl = pickYtDlpDownloadUrl(entry);
  const duration = formatDuration(entry.duration_string || entry.duration);
  const summary = toSummary(entry.description);

  if (downloadUrl && downloadUrl !== entry.webpage_url) {
    const inferredExt = entry.ext || inferExtensionFromUrl(downloadUrl);
    const media = classifyMedia(inferredExt);

    return buildSuccessItem({
      platform,
      url,
      title,
      author,
      thumbnail,
      downloadUrl,
      duration,
      summary,
      extension: media.extension,
      fileType: media.fileType,
      source: 'yt-dlp',
    });
  }

  return buildSuccessItem({
    platform,
    url,
    title,
    author,
    thumbnail,
    content: buildMarkdownDocument(title, entry.description, author, entry.webpage_url || url),
    duration,
    summary,
    extension: 'md',
    fileType: 'markdown',
    source: 'yt-dlp',
  });
}

export class ResolveValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ResolveValidationError';
  }
}

export async function resolveDownloadItem(url: string): Promise<DownloadItem> {
  const platform = detectPlatform(url);

  if (platform === 'unknown') {
    throw new ResolveValidationError('暂不支持该平台链接');
  }

  if (!isAllowedUrl(url, platform)) {
    throw new ResolveValidationError('链接域名与平台不匹配');
  }

  switch (platform) {
    case 'zhihu':
      return resolveZhihu(url);
    case 'xiaoyuzhou':
      return resolveXiaoyuzhou(url);
    case 'wechat':
      return resolveWechatArticle(url);
    case 'kuaishou':
    case 'videohao':
      return resolvePageFallback(url, platform);
    default:
      if (YT_DLP_PLATFORMS.has(platform)) {
        return resolveViaYtDlp(url, platform);
      }
      return resolvePageFallback(url, platform);
  }
}

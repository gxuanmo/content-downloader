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
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const FETCH_TIMEOUT_MS = 12_000;

const fetchDispatcher = new Agent({
  connect: {
    timeout: FETCH_TIMEOUT_MS,
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

async function discardResponseBody(response: Response) {
  try {
    await response.body?.cancel();
  } catch {}
}

async function readBodyWithLimit(response: Response, limit: number): Promise<string> {
  const declared = Number(response.headers.get('content-length') || '0');
  if (declared > limit) {
    await discardResponseBody(response);
    throw new Error(`上游响应体积超过限制 (${limit} 字节)`);
  }

  if (!response.body) {
    return '';
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: false });
  let received = 0;
  let result = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        result += decoder.decode();
        return result;
      }
      received += value.byteLength;
      if (received > limit) {
        try {
          await reader.cancel();
        } catch {}
        throw new Error(`上游响应体积超过限制 (${limit} 字节)`);
      }
      result += decoder.decode(value, { stream: true });
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

async function fetchHtml(
  url: string,
  platform?: Exclude<PlatformType, 'unknown'>,
  extraHeaders?: Record<string, string>,
) {
  let currentUrl = await assertSafeRemoteUrl(url);

  for (let hop = 0; hop <= MAX_HTML_REDIRECTS; hop += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        headers: { ...DEFAULT_HEADERS, ...extraHeaders },
        redirect: 'manual',
        cache: 'no-store',
        signal: controller.signal,
        // @ts-expect-error undici dispatcher
        dispatcher: fetchDispatcher,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (
        error instanceof DOMException ||
        (error instanceof Error && error.name === 'AbortError')
      ) {
        throw new Error(`页面请求超时 (${FETCH_TIMEOUT_MS / 1000}s)`);
      }
      throw error;
    }

    if (response.status >= 300 && response.status < 400) {
      clearTimeout(timeoutId);
      const location = response.headers.get('location');
      if (!location) {
        await discardResponseBody(response);
        throw new Error(`页面请求失败 (${response.status})`);
      }
      let nextUrl: URL;
      try {
        nextUrl = await assertSafeRemoteUrl(new URL(location, currentUrl).toString());
      } catch (error) {
        await discardResponseBody(response);
        throw error;
      }
      if (platform && !isAllowedUrl(nextUrl.toString(), platform)) {
        await discardResponseBody(response);
        throw new Error('重定向目标不在该平台允许的域名列表内');
      }
      currentUrl = nextUrl;
      await discardResponseBody(response);
      continue;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      await discardResponseBody(response);
      throw new Error(`页面请求失败 (${response.status})`);
    }

    const html = await readBodyWithLimit(response, MAX_HTML_BYTES);
    clearTimeout(timeoutId);
    return {
      html,
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

function getZhihuCookie(): string | undefined {
  const raw = process.env.ZHIHU_COOKIE;
  if (!raw) return undefined;
  const trimmed = raw.trim();
  return trimmed || undefined;
}

async function resolveZhihu(url: string): Promise<DownloadItem> {
  const articleMatch = url.match(/(?:article\/|zhuanlan\.zhihu\.com\/p\/|\/p\/)(\d+)/);
  const questionMatch = url.match(/question\/(\d+)/);
  const answerMatch = url.match(/answer\/(\d+)/);

  if (!articleMatch && !questionMatch) {
    throw new Error('暂不支持该知乎链接格式');
  }

  const cookie = getZhihuCookie();
  if (!cookie) {
    throw new ResolveValidationError(
      '知乎需要登录后才能抓取内容。请设置环境变量 ZHIHU_COOKIE=你的知乎Cookie 后重试。' +
        '获取方式：浏览器登录知乎 → F12 → Application → Cookies → 复制所有 cookie 值',
    );
  }

  const extraHeaders: Record<string, string> = { Cookie: cookie };

  let pageUrl = url;
  if (answerMatch) {
    if (!questionMatch) {
      throw new Error('暂不支持该知乎回答链接格式，请使用包含问题 ID 的完整链接');
    }
    pageUrl = `https://www.zhihu.com/question/${questionMatch[1]}/answer/${answerMatch[1]}`;
  } else if (questionMatch) {
    pageUrl = `https://www.zhihu.com/question/${questionMatch[1]}`;
  }

  let html: string;
  let finalUrl: string;
  try {
    const result = await fetchHtml(pageUrl, 'zhihu', extraHeaders);
    html = result.html;
    finalUrl = result.finalUrl;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('403') || message.includes('超时')) {
      throw new ResolveValidationError(
        '知乎页面访问失败，可能是 Cookie 已过期。请重新获取并设置 ZHIHU_COOKIE 环境变量。' +
          '获取方式：浏览器登录知乎 → F12 → Application → Cookies → 复制所有 cookie 值',
      );
    }
    throw error;
  }
  const $ = load(html);

  $('script, style, noscript').remove();

  let title = '';
  let author: string | undefined;
  let htmlContent = '';

  if (articleMatch) {
    title =
      cleanText($('.Post-Title').first().text()) ||
      cleanText($('h1.Post-Title').first().text()) ||
      cleanText($('title').text().replace(/\s*[-–—|]\s*知乎.*$/, ''));
    author =
      cleanText($('.AuthorInfo-name').first().text()) ||
      cleanText($('[itemprop="author"]').attr('content')) ||
      undefined;
    htmlContent = $('.RichText').first().html() || $('.Post-RichText').first().html() || '';
  } else {
    title =
      cleanText($('.QuestionHeader-title').first().text()) ||
      cleanText($('h1.QuestionHeader-title').first().text()) ||
      cleanText($('title').text().replace(/\s*[-–—|]\s*知乎.*$/, ''));
    author =
      cleanText($('.AuthorInfo-name').first().text()) ||
      cleanText($('[itemprop="author"]').attr('content')) ||
      undefined;
    htmlContent =
      $('.RichContent-inner').first().html() ||
      $('.AnswerItem .RichText').first().html() ||
      $('.RichText').first().html() ||
      '';
  }
  if (!htmlContent) {
    throw new Error('知乎页面抓取失败，请检查 ZHIHU_COOKIE 是否有效');
  }

  const markdownBody = htmlContent ? turndown.turndown(htmlContent) : '';
  const finalTitle = title || '知乎内容';
  const finalAuthor = author || undefined;

  return buildSuccessItem({
    platform: 'zhihu',
    url,
    title: finalTitle,
    author: finalAuthor,
    content: buildMarkdownDocument(finalTitle, markdownBody, finalAuthor, finalUrl),
    summary: toSummary(markdownBody || title || undefined),
    extension: 'md',
    fileType: 'markdown',
    source: 'html',
  });
}

async function resolveXiaoyuzhou(url: string): Promise<DownloadItem> {
  const { html, finalUrl } = await fetchHtml(url, 'xiaoyuzhou');
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
  const { html, finalUrl } = await fetchHtml(url, 'wechat');
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
  const { html, finalUrl } = await fetchHtml(
    url,
    platform === 'unknown' ? undefined : platform
  );
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
  // 未知扩展名默认按视频处理。yt-dlp 支持的平台以视频为主，
  // 图片平台（小红书图文）在 yt-dlp 失败后会走 HTML 兜底，不会进到这里。
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

async function resolveXiaohongshuFallback(url: string): Promise<DownloadItem> {
  const { html, finalUrl } = await fetchHtml(url, 'xiaohongshu');
  const $ = load(html);

  $('script, style, noscript').remove();

  const title =
    cleanText($('#detail-title').first().text()) ||
    cleanText($('.title').first().text()) ||
    extractMeta($, 'meta[property="og:title"]') ||
    cleanText($('title').text()) ||
    '小红书笔记';

  const description =
    cleanText($('#detail-desc').first().text()) ||
    cleanText($('.desc').first().text()) ||
    extractMeta($, 'meta[property="og:description"]') ||
    extractMeta($, 'meta[name="description"]') ||
    '';

  const images = $('.swiper-slide img, .note-image img, .slide img, img[src*="sns-webpic"]')
    .map((_, el) => $(el).attr('src'))
    .get()
    .filter((s): s is string => Boolean(s))
    .map((src) => normalizeMaybeUrl(src, finalUrl))
    .filter((s): s is string => Boolean(s));

  const author =
    cleanText($('.username').first().text()) ||
    cleanText($('.author .name').first().text()) ||
    undefined;

  const thumbnail = normalizeMaybeUrl(extractMeta($, 'meta[property="og:image"]'), finalUrl);

  const markdownBody = [
    description,
    images.length > 0 ? `\n\n> 共 ${images.length} 张图片` : '',
    ...images.map((src, i) => `\n![](${src})`),
  ].join('');

  // Fail if neither description nor images were extracted — likely client-rendered or blocked
  if (!description && images.length === 0) {
    throw new Error('小红书笔记内容抓取失败，页面可能需要登录或已改版');
  }

  return buildSuccessItem({
    platform: 'xiaohongshu',
    url,
    title,
    author,
    thumbnail,
    content: buildMarkdownDocument(title, markdownBody, author, finalUrl),
    summary: toSummary(description) || `小红书图文笔记，含 ${images.length} 张图片`,
    extension: 'md',
    fileType: 'markdown',
    source: 'html',
  });
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
        try {
          return await resolveViaYtDlp(url, platform);
        } catch (error) {
          if (platform === 'xiaohongshu') {
            return resolveXiaohongshuFallback(url);
          }
          throw error;
        }
      }
      return resolvePageFallback(url, platform);
  }
}

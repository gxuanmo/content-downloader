'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileText,
  Globe2,
  History,
  Loader2,
  Music,
  Package,
  Trash2,
  Video,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { resolveBatchUrls, resolveUrl } from '@/lib/platforms/resolver';
import {
  buildSafeFilename,
  downloadResolvedItem,
  fetchRemoteItemBlob,
  getDownloadFilename,
} from '@/lib/utils/download';
import { createZip } from '@/lib/utils/zip';
import { clearHistory, getHistory, removeFromHistory, addToHistory } from '@/lib/utils/storage';
import { detectPlatform, validateURL } from '@/lib/utils/platform-detector';
import { DownloadItem, PlatformType } from '@/types';

const SUPPORTED_PLATFORM_LABELS = [
  '抖音',
  '快手',
  '视频号',
  'TikTok',
  '小红书',
  '公众号',
  'X',
  'Bilibili',
  'YouTube',
  '知乎',
  '小宇宙',
];

export default function Home() {
  const [url, setUrl] = useState('');
  const [batchUrls, setBatchUrls] = useState('');
  const [isBatchMode, setIsBatchMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<DownloadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<DownloadItem[]>([]);
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformType>('unknown');
  const [activeDownloadId, setActiveDownloadId] = useState<string | null>(null);
  const [exportingZip, setExportingZip] = useState(false);

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  useEffect(() => {
    setDetectedPlatform(url.trim() ? detectPlatform(url.trim()) : 'unknown');
  }, [url]);

  const successCount = useMemo(
    () => results.filter((item) => item.status === 'success').length,
    [results]
  );

  const runWithProgress = async <T,>(work: () => Promise<T>) => {
    setLoading(true);
    setError(null);
    setProgress(0);

    const progressInterval = window.setInterval(() => {
      setProgress((current) => (current >= 90 ? current : current + 10));
    }, 250);

    try {
      const value = await work();
      setProgress(100);
      return value;
    } finally {
      window.clearInterval(progressInterval);
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    const nextUrl = url.trim();

    if (!nextUrl || !validateURL(nextUrl)) {
      setError('请输入有效的 URL');
      return;
    }

    try {
      const item = await runWithProgress(() => resolveUrl(nextUrl));
      setResults([item]);

      if (item.status === 'success') {
        addToHistory(item);
        setHistory(getHistory());
      }
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : '解析失败');
    }
  };

  const handleBatchDownload = async () => {
    const urls = batchUrls
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      setError('请输入至少一个链接');
      return;
    }

    if (urls.length > 20) {
      setError('批量解析最多支持 20 个链接');
      return;
    }

    const invalid = urls.find((item) => !validateURL(item));
    if (invalid) {
      setError(`存在无效链接: ${invalid}`);
      return;
    }

    try {
      const items = await runWithProgress(() => resolveBatchUrls(urls));
      setResults(items);

      items
        .filter((item) => item.status === 'success')
        .forEach((item) => addToHistory(item));

      setHistory(getHistory());
    } catch (err) {
      setResults([]);
      setError(err instanceof Error ? err.message : '批量解析失败');
    }
  };

  const downloadSingle = async (item: DownloadItem) => {
    try {
      setActiveDownloadId(item.id);
      await downloadResolvedItem(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    } finally {
      setActiveDownloadId(null);
    }
  };

  const downloadBatch = async () => {
    if (results.length === 0) {
      return;
    }

    try {
      setExportingZip(true);

      const files = [];

      for (const item of results) {
        if (item.content) {
          files.push({
            name: getDownloadFilename(item),
            content: item.content,
          });
          continue;
        }

        if (item.downloadUrl && item.status === 'success') {
          try {
            const { blob, filename } = await fetchRemoteItemBlob(item);
            files.push({
              name: filename,
              content: blob,
            });
            continue;
          } catch (err) {
            files.push({
              name: buildSafeFilename(`${item.title || 'download'}_下载失败`, 'txt'),
              content: err instanceof Error ? err.message : '下载失败',
            });
            continue;
          }
        }

        const body = [
          `标题：${item.title}`,
          `平台：${getPlatformName(item.platform)}`,
          `原链接：${item.url}`,
          item.downloadUrl ? `解析到的下载链接：${item.downloadUrl}` : '',
          item.summary ? `摘要：${item.summary}` : '',
          item.error ? `错误：${item.error}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        files.push({
          name: buildSafeFilename(item.title || 'result', 'txt'),
          content: body,
        });
      }

      await createZip(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : '打包导出失败');
    } finally {
      setExportingZip(false);
    }
  };

  const handleDeleteHistory = (id: string) => {
    removeFromHistory(id);
    setHistory(getHistory());
  };

  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  const getPlatformIcon = (platform: PlatformType) => {
    switch (platform) {
      case 'zhihu':
      case 'wechat':
        return <FileText className="h-4 w-4" />;
      case 'xiaoyuzhou':
        return <Music className="h-4 w-4" />;
      case 'bilibili':
      case 'douyin':
      case 'kuaishou':
      case 'videohao':
      case 'tiktok':
      case 'x':
      case 'youtube':
        return <Video className="h-4 w-4" />;
      case 'xiaohongshu':
        return <Globe2 className="h-4 w-4" />;
      default:
        return <Globe2 className="h-4 w-4" />;
    }
  };

  const getPlatformName = (platform: PlatformType) => {
    switch (platform) {
      case 'zhihu':
        return '知乎';
      case 'xiaoyuzhou':
        return '小宇宙';
      case 'bilibili':
        return 'Bilibili';
      case 'douyin':
        return '抖音';
      case 'kuaishou':
        return '快手';
      case 'videohao':
        return '视频号';
      case 'tiktok':
        return 'TikTok';
      case 'xiaohongshu':
        return '小红书';
      case 'wechat':
        return '公众号';
      case 'x':
        return 'X';
      case 'youtube':
        return 'YouTube';
      default:
        return '未知';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <div className="mb-12 text-center">
          <h1 className="mb-4 text-4xl font-bold text-gray-900">Content Downloader</h1>
          <p className="mx-auto max-w-3xl text-lg text-gray-600">
            统一解析抖音、快手、视频号、TikTok、小红书、公众号、X、Bilibili、YouTube、知乎、小宇宙链接
          </p>
          <p className="mt-3 text-sm text-gray-500">
            支持单条解析和批量解析，批量模式允许混合平台，单次最多 20 条。
          </p>
        </div>

        <Card className="mb-8">
          <CardHeader>
            <CardTitle>输入链接</CardTitle>
            <CardDescription>
              {isBatchMode ? '每行一个链接，可混合平台，最多 20 个。' : '粘贴任一受支持平台的链接。'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {isBatchMode ? (
              <Textarea
                placeholder={[
                  'https://www.douyin.com/video/...',
                  'https://www.youtube.com/watch?v=...',
                  'https://mp.weixin.qq.com/s?...',
                ].join('\n')}
                value={batchUrls}
                onChange={(event) => setBatchUrls(event.target.value)}
                className="min-h-[140px]"
                disabled={loading}
              />
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="粘贴抖音 / 快手 / 视频号 / TikTok / 小红书 / 公众号 / X / Bilibili / YouTube / 知乎 / 小宇宙链接"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  disabled={loading}
                />
                {detectedPlatform !== 'unknown' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {getPlatformIcon(detectedPlatform)}
                    <span>检测到 {getPlatformName(detectedPlatform)} 链接</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsBatchMode((current) => !current);
                  setError(null);
                  setResults([]);
                }}
                disabled={loading}
              >
                {isBatchMode ? '切换到单条解析' : '切换到批量解析'}
              </Button>
              <span className="text-xs text-muted-foreground">
                已支持：{SUPPORTED_PLATFORM_LABELS.join(' / ')}
              </span>
            </div>

            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>解析中...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>错误</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button
              className="w-full"
              size="lg"
              onClick={isBatchMode ? handleBatchDownload : handleDownload}
              disabled={loading || (isBatchMode ? !batchUrls.trim() : !url.trim())}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  处理中...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  {isBatchMode ? '批量解析' : '开始解析'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>解析结果</CardTitle>
                  <CardDescription>
                    共 {results.length} 条，成功 {successCount} 条，失败 {results.length - successCount} 条
                  </CardDescription>
                </div>
                {results.length > 1 && (
                  <Button variant="outline" size="sm" onClick={downloadBatch} disabled={exportingZip}>
                    {exportingZip ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Package className="mr-2 h-4 w-4" />
                    )}
                    {exportingZip ? '打包中...' : '打包导出'}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {results.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-lg border p-4 ${item.status === 'failed' ? 'border-red-200 bg-red-50' : 'bg-card'}`}
                >
                  <div className="flex items-start gap-4">
                    {item.thumbnail && (
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-16 w-24 rounded-md object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center gap-2 text-sm text-muted-foreground">
                        {getPlatformIcon(item.platform)}
                        <span>{getPlatformName(item.platform)}</span>
                        <span>·</span>
                        <span>{item.source || '解析'}</span>
                        <span>·</span>
                        <span className={item.status === 'failed' ? 'text-red-600' : 'text-emerald-600'}>
                          {item.status === 'failed' ? '失败' : '成功'}
                        </span>
                      </div>
                      <h4 className="truncate font-medium">{item.title}</h4>
                      {item.author && (
                        <p className="text-sm text-muted-foreground">作者：{item.author}</p>
                      )}
                      {item.duration && (
                        <p className="text-sm text-muted-foreground">时长：{item.duration}</p>
                      )}
                      {item.summary && (
                        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.summary}</p>
                      )}
                      {item.error && (
                        <p className="mt-2 text-sm text-red-600">{item.error}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={item.status === 'failed' ? 'outline' : 'default'}
                        onClick={() => {
                          void downloadSingle(item);
                        }}
                        disabled={activeDownloadId === item.id}
                      >
                        {activeDownloadId === item.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : item.status === 'failed' ? (
                          <AlertCircle className="h-4 w-4" />
                        ) : (
                          <Download className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {history.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <History className="h-5 w-5" />
                  <CardTitle>历史记录</CardTitle>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  className="text-destructive"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  清空
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {history.slice(0, 8).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        {getPlatformIcon(item.platform)}
                        <span>{getPlatformName(item.platform)}</span>
                        <span>·</span>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                      </div>
                      <div className="truncate">{item.title}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeleteHistory(item.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p className="mb-2">
            支持平台：{SUPPORTED_PLATFORM_LABELS.join(' / ')}
          </p>
          <p>仅供学习研究使用，请遵守各平台服务条款与相关法律法规。</p>
        </footer>
      </div>
    </main>
  );
}

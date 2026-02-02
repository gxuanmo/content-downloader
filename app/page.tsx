'use client';

import React, { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  Download, 
  FileText, 
  Music, 
  Video, 
  Trash2, 
  History, 
  AlertCircle,
  CheckCircle2,
  Loader2,
  Package,
  ExternalLink
} from 'lucide-react';
import { detectPlatform, validateURL } from '@/lib/utils/platform-detector';
import { addToHistory, getHistory, removeFromHistory, clearHistory } from '@/lib/utils/storage';
import { createZip } from '@/lib/utils/zip';
import { parseZhihuArticle, htmlToMarkdown } from '@/lib/platforms/zhihu';
import { parseXiaoyuzhouEpisode, parseXiaoyuzhouBatch } from '@/lib/platforms/xiaoyuzhou';
import { parseBilibiliVideo, parseBilibiliBatch } from '@/lib/platforms/bilibili';
import { DownloadItem, PlatformType } from '@/types';

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

  // 加载历史记录
  useEffect(() => {
    setHistory(getHistory());
  }, []);

  // 检测平台
  useEffect(() => {
    if (url) {
      setDetectedPlatform(detectPlatform(url));
    }
  }, [url]);

  // 单个下载
  const handleDownload = async () => {
    if (!url || !validateURL(url)) {
      setError('请输入有效的URL');
      return;
    }

    const platform = detectPlatform(url);
    if (platform === 'unknown') {
      setError('暂不支持该平台，目前支持知乎、小宇宙、B站');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress(0);

    try {
      // 模拟进度
      const progressInterval = setInterval(() => {
        setProgress(p => (p >= 90 ? 90 : p + 10));
      }, 300);

      let result: DownloadItem;

      switch (platform) {
        case 'zhihu':
          const zhihuData = await parseZhihuArticle(url);
          const markdown = htmlToMarkdown(zhihuData.content);
          result = {
            id: Date.now().toString(),
            platform,
            url,
            title: zhihuData.title,
            author: zhihuData.author,
            content: markdown,
            fileType: 'markdown',
            status: 'success',
            createdAt: Date.now(),
          };
          break;

        case 'xiaoyuzhou':
          const xyzData = await parseXiaoyuzhouEpisode(url);
          result = {
            id: Date.now().toString(),
            platform,
            url,
            title: xyzData.title,
            thumbnail: xyzData.cover,
            downloadUrl: xyzData.audioUrl,
            duration: xyzData.duration,
            fileType: 'audio',
            status: 'success',
            createdAt: Date.now(),
          };
          break;

        case 'bilibili':
          const biliData = await parseBilibiliVideo(url);
          result = {
            id: Date.now().toString(),
            platform,
            url,
            title: biliData.title,
            author: biliData.author,
            thumbnail: biliData.cover,
            downloadUrl: biliData.videoUrl,
            duration: biliData.duration,
            fileType: 'video',
            status: 'success',
            createdAt: Date.now(),
          };
          break;

        default:
          throw new Error('不支持的平台');
      }

      clearInterval(progressInterval);
      setProgress(100);
      setResults([result]);
      addToHistory(result);
      setHistory(getHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    } finally {
      setLoading(false);
    }
  };

  // 批量下载
  const handleBatchDownload = async () => {
    const urls = batchUrls.split('\n').filter(u => u.trim());
    
    if (urls.length === 0) {
      setError('请输入至少一个URL');
      return;
    }

    if (urls.length > 10) {
      setError('批量下载最多支持10个链接');
      return;
    }

    // 检测所有链接的平台
    const platforms = urls.map(detectPlatform);
    const uniquePlatforms = Array.from(new Set(platforms));
    
    if (uniquePlatforms.length !== 1 || uniquePlatforms[0] === 'unknown') {
      setError('批量下载要求所有链接来自同一平台（知乎/小宇宙/B站）');
      return;
    }

    const platform = uniquePlatforms[0];

    setLoading(true);
    setError(null);
    setProgress(0);
    setResults([]);

    try {
      let batchResults: DownloadItem[] = [];

      switch (platform) {
        case 'xiaoyuzhou':
          const xyzBatchData = await parseXiaoyuzhouBatch(urls);
          batchResults = xyzBatchData.map((data, index) => ({
            id: `${Date.now()}_${index}`,
            platform,
            url: urls[index],
            title: data.title,
            thumbnail: data.cover,
            downloadUrl: data.audioUrl,
            duration: data.duration,
            fileType: 'audio',
            status: 'success',
            createdAt: Date.now(),
          }));
          break;

        case 'bilibili':
          const biliBatchData = await parseBilibiliBatch(urls);
          batchResults = biliBatchData.map((data, index) => ({
            id: `${Date.now()}_${index}`,
            platform,
            url: urls[index],
            title: data.title,
            author: data.author,
            thumbnail: data.cover,
            downloadUrl: data.videoUrl,
            duration: data.duration,
            fileType: 'video',
            status: 'success',
            createdAt: Date.now(),
          }));
          break;

        default:
          throw new Error('该平台暂不支持批量下载');
      }

      // 模拟进度
      for (let i = 0; i <= 100; i += 10) {
        setProgress(i);
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      setResults(batchResults);
      batchResults.forEach(item => addToHistory(item));
      setHistory(getHistory());
    } catch (err) {
      setError(err instanceof Error ? err.message : '批量下载失败');
    } finally {
      setLoading(false);
    }
  };

  // 下载单个文件
  const downloadSingle = (item: DownloadItem) => {
    if (item.content) {
      // Markdown文件
      const blob = new Blob([item.content], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${item.title}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } else if (item.downloadUrl) {
      // 音频/视频链接
      window.open(item.downloadUrl, '_blank');
    }
  };

  // 批量打包下载
  const downloadBatch = async () => {
    if (results.length === 0) return;

    const files = results.map(item => {
      if (item.content) {
        return {
          name: `${item.title}.md`,
          content: item.content,
        };
      } else {
        // 对于音频/视频，创建一个包含链接的文本文件
        return {
          name: `${item.title}_链接.txt`,
          content: item.downloadUrl || '',
        };
      }
    });

    await createZip(files);
  };

  // 删除历史记录
  const handleDeleteHistory = (id: string) => {
    removeFromHistory(id);
    setHistory(getHistory());
  };

  // 清空历史
  const handleClearHistory = () => {
    clearHistory();
    setHistory([]);
  };

  // 获取平台图标
  const getPlatformIcon = (platform: PlatformType) => {
    switch (platform) {
      case 'zhihu':
        return <FileText className="h-4 w-4" />;
      case 'xiaoyuzhou':
        return <Music className="h-4 w-4" />;
      case 'bilibili':
        return <Video className="h-4 w-4" />;
      default:
        return null;
    }
  };

  // 获取平台名称
  const getPlatformName = (platform: PlatformType) => {
    switch (platform) {
      case 'zhihu':
        return '知乎';
      case 'xiaoyuzhou':
        return '小宇宙';
      case 'bilibili':
        return 'B站';
      default:
        return '未知';
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Content Downloader
          </h1>
          <p className="text-lg text-gray-600">
            免费下载知乎文章、小宇宙播客、B站视频
          </p>
        </div>

        {/* Main Card */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>输入链接</CardTitle>
            <CardDescription>
              {isBatchMode 
                ? '每行输入一个链接，最多10个' 
                : '粘贴知乎/小宇宙/B站链接'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input Area */}
            {isBatchMode ? (
              <Textarea
                placeholder="https://xiaoyuzhoufm.com/episode/xxx&#10;https://xiaoyuzhoufm.com/episode/yyy"
                value={batchUrls}
                onChange={(e) => setBatchUrls(e.target.value)}
                className="min-h-[120px]"
                disabled={loading}
              />
            ) : (
              <div className="space-y-2">
                <Input
                  placeholder="https://zhihu.com/... 或 https://xiaoyuzhoufm.com/... 或 https://bilibili.com/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
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

            {/* Mode Toggle */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsBatchMode(!isBatchMode);
                  setError(null);
                  setResults([]);
                }}
                disabled={loading}
              >
                {isBatchMode ? '切换到单条下载' : '切换到批量下载'}
              </Button>
            </div>

            {/* Progress */}
            {loading && (
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>解析中...</span>
                  <span>{progress}%</span>
                </div>
                <Progress value={progress} />
              </div>
            )}

            {/* Error */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>错误</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Action Button */}
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
                  {isBatchMode ? '批量解析' : '开始下载'}
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        {results.length > 0 && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>下载结果</CardTitle>
                {results.length > 1 && (
                  <Button variant="outline" size="sm" onClick={downloadBatch}>
                    <Package className="mr-2 h-4 w-4" />
                    打包下载
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {results.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-4 p-4 rounded-lg border bg-card"
                >
                  {item.thumbnail && (
                    <img
                      src={item.thumbnail}
                      alt={item.title}
                      className="w-24 h-16 object-cover rounded-md"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {getPlatformIcon(item.platform)}
                      <span className="text-sm text-muted-foreground">
                        {getPlatformName(item.platform)}
                      </span>
                    </div>
                    <h4 className="font-medium truncate">{item.title}</h4>
                    {item.author && (
                      <p className="text-sm text-muted-foreground">
                        作者：{item.author}
                      </p>
                    )}
                    {item.duration && (
                      <p className="text-sm text-muted-foreground">
                        时长：{item.duration}
                      </p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    onClick={() => downloadSingle(item)}
                    disabled={!item.content && !item.downloadUrl}
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* History */}
        {history.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
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
                {history.slice(0, 5).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {getPlatformIcon(item.platform)}
                      <span className="truncate">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">
                        {new Date(item.createdAt).toLocaleDateString()}
                      </span>
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

        {/* Footer */}
        <footer className="mt-12 text-center text-sm text-muted-foreground">
          <p className="mb-2">支持平台：知乎 | 小宇宙 | B站</p>
          <p>仅供学习研究使用，请遵守各平台服务条款</p>
        </footer>
      </div>
    </main>
  );
}

# Content Downloader

统一解析多平台内容链接的 Next.js 工具，支持单条解析、混合平台批量解析、历史记录和批量导出。

## 当前支持

### 视频 / 媒体平台

- 抖音
- 快手
- 视频号
- TikTok
- 小红书
- X
- Bilibili
- YouTube
- 小宇宙

### 文章 / 文本平台

- 公众号
- 知乎

## 解析方式

- `yt-dlp` 解析：抖音、TikTok、小红书、X、Bilibili、YouTube
- 页面解析：公众号、小宇宙
- 页面兜底解析：快手、视频号
- API / HTML 转 Markdown：知乎、公众号

说明：

- `yt-dlp` 支持的平台通常能拿到更完整的媒体信息与直链。
- 快手、视频号目前是 best-effort 兜底解析，优先尝试页面里的公开媒体地址；如果页面没有暴露直链，会退化为导出说明文本。
- 公众号文章有时会触发微信验证码页，这种情况下会退化为保存原链接说明。

## 功能特性

- 单条链接解析
- 混合平台批量解析
- 媒体文件真实下载（通过服务端下载代理）
- 本地历史记录
- 解析结果打包导出，媒体文件会尽量以真实二进制写入 ZIP
- 失败项保留，不会因为一条失败导致整批错位

## 技术栈

- Next.js 14
- React 18
- TypeScript
- Tailwind CSS
- `cheerio`
- `turndown`
- `yt-dlp`（可选但强烈建议安装）

## 快速开始

### 1. 安装 Node 依赖

```bash
npm install
```

### 2. 安装 `yt-dlp`

推荐：

```bash
npm run setup:yt-dlp
```

等价命令：

```bash
python -m pip install -r requirements.txt
```

### 3. 启动开发环境

```bash
npm run dev
```

访问 `http://localhost:3000`

## 生产运行

```bash
npm run build
npm start
```

## 部署说明

如果你希望稳定支持抖音、TikTok、小红书、X、Bilibili、YouTube 这类视频平台，推荐使用可执行 `yt-dlp` 的自托管 Node.js 运行环境。

纯 Serverless / Vercel 场景下：

- 页面解析类平台仍可工作
- 依赖 `yt-dlp` 的平台可能受运行时限制影响

## 使用方式

### 单条解析

1. 粘贴链接
2. 自动识别平台
3. 点击“开始解析”
4. 成功后可直接下载媒体文件，或导出 Markdown

### 批量解析

1. 切换到批量模式
2. 每行一个链接
3. 支持混合平台
4. 单次最多 20 条
5. 解析完成后可打包导出，支持把真实媒体文件写入 ZIP

## API 端点

- `POST /api/resolve`：解析单个链接
- `POST /api/resolve/batch`：批量解析链接
- `POST /api/download`：代理下载媒体文件

请求示例：

```json
{
  "url": "https://youtu.be/dQw4w9WgXcQ"
}
```

```json
{
  "urls": [
    "https://youtu.be/dQw4w9WgXcQ",
    "https://mp.weixin.qq.com/s?..."
  ]
}
```

## 注意事项

- 媒体直链可能有时效性，请及时处理。
- 大体积视频在浏览器里打包 ZIP 时会占用较多内存，导出速度也会更慢。
- 各平台公开页面结构会变化，兜底解析平台可能需要持续维护。
- 仅供学习研究使用，请遵守目标平台服务条款和相关法律法规。

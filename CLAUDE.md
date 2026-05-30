# CLAUDE.md — Content Downloader

Next.js 14 (App Router) + TypeScript + Tailwind CSS 内容下载器。
支持 11 个平台：抖音、快手、视频号、TikTok、小红书、X、Bilibili、YouTube、小宇宙、公众号、知乎。

## 常用命令

```bash
npm run dev           # 开发服务器 http://localhost:3000
npm run build         # 生产构建（含 Next.js 内置 lint）
npm test              # vitest 单元测试
npx tsc --noEmit      # TypeScript 类型检查
npm run setup:yt-dlp  # 安装 yt-dlp Python 依赖
```

## 架构概览

```
app/
  page.tsx              # 单页应用：单条/批量解析、平台识别、历史、ZIP 导出
  api/resolve/route.ts  # POST /api/resolve — 单条解析
  api/resolve/batch/route.ts  # POST /api/resolve/batch — 批量解析（最多 20 条）
  api/download/route.ts # POST /api/download — 媒体下载代理

lib/
  server/resolver.ts    # 核心解析器：平台分发、知乎 HTML+cookie、yt-dlp 子进程、HTML 兜底
  server/yt-dlp.ts      # yt-dlp 子进程调用与格式选择
  server/curl-download.ts  # curl 兜底下载（不跟随重定向、体积上限）
  server/remote-url.ts  # SSRF 校验：协议/域名/IP/DNS 四层校验
  platforms/resolver.ts # 客户端调用 /api/resolve 的薄封装
  utils/                # 平台检测、下载、localStorage 历史、JSZip 打包

types/                  # 共享 TypeScript 类型
tests/                  # Vitest 单元测试
```

## 解析链路

| 平台 | 方式 |
|------|------|
| 抖音、TikTok、Bilibili、YouTube、X | yt-dlp 子进程 → 格式选择 → 直链 |
| 小红书 | yt-dlp（视频笔记）→ HTML 兜底（图文笔记） |
| 知乎 | HTML + Cookie → cheerio 提取 → turndown 转 Markdown |
| 公众号、小宇宙 | HTML 页面解析 |
| 快手、视频号 | HTML 兜底（best-effort） |

## 环境变量

| 变量 | 必填 | 说明 |
|------|------|------|
| `ZHIHU_COOKIE` | 知乎解析必填 | 浏览器登录知乎 → F12 → Application → Cookies 复制 |
| `DOUYIN_COOKIE` | 计划中 | 抖音 yt-dlp 可能需要新鲜 cookie |

## 代码规范

- TypeScript 严格模式，所有函数返回值声明类型
- API 路由必须 try-catch，返回统一格式 `{ success: boolean, data?: any, error?: string }`
- 客户端组件标记 `'use client'`
- 使用 `@/*` 路径别名
- Import 顺序：React/Next → 第三方 → 本地组件 → 工具函数 → 类型
- 文件命名：组件 PascalCase，工具函数 camelCase
- 提交信息用中文，格式：`<类型>: <描述>`

## 安全

- `remote-url.ts` 对所有外部 URL 做四层 SSRF 校验
- `curl-download.ts` 不跟随重定向、硬限制体积
- `resolver.ts` 限制 HTML 重定向次数和响应体积
- 环境变量不进代码，`.env.local` 已在 `.gitignore`

## 已知限制

- 快手、视频号是兜底解析，取决于页面是否暴露媒体直链
- yt-dlp 依赖 Python 环境和子进程，Serverless 不可用
- 知乎需有效 Cookie，过期后需重新获取
- codex review 配额在 2026-06-01 09:57 前不可用

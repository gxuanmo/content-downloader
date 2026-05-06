# AGENTS.md - AI Agent Guidelines

## Project Overview

Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui 内容下载器
支持平台：抖音、快手、视频号、TikTok、小红书、X、Bilibili、YouTube、小宇宙、公众号、知乎

## Build/Lint Commands

```bash
# 开发
npm run dev          # 启动开发服务器 http://localhost:3000

# 构建
npm run build        # 生产构建
npm run start        # 启动生产服务器

# 代码检查
npm run lint         # ESLint 检查

# TypeScript 检查
npx tsc --noEmit     # 类型检查不输出
```

## 项目结构

```
app/
  api/
    resolve/         # 单条/批量统一解析（POST /api/resolve、/api/resolve/batch）
    download/        # 媒体下载代理（带 SSRF 与重定向防护、体积上限）
  page.tsx           # 主页面（单条/批量、平台识别、历史、ZIP 导出）
  layout.tsx
  globals.css

components/ui/       # shadcn/ui 组件

lib/
  platforms/
    resolver.ts      # 客户端调用 /api/resolve 的薄封装
  server/
    resolver.ts      # 各平台分发：知乎 API、公众号/小宇宙 HTML、yt-dlp 子进程、HTML 兜底
    yt-dlp.ts        # 调 python -m yt_dlp
    curl-download.ts # curl 兜底下载（不跟随重定向，带体积上限）
    remote-url.ts    # SSRF 校验：协议/域名/IP/DNS 都校验
  utils/
    platform-detector.ts
    download.ts      # 客户端下载/远端拉取
    storage.ts       # localStorage 历史
    zip.ts           # JSZip 打包

types/               # 共享类型
```

## Code Style Guidelines

### Imports 顺序
1. React/Next 内置
2. 第三方库
3. 本地组件
4. 工具函数
5. 类型定义

### 命名规范
- 组件：PascalCase (e.g., `DownloadButton.tsx`)
- 函数/变量：camelCase (e.g., `handleDownload`)
- 类型/接口：PascalCase (e.g., `DownloadItem`)
- 常量：UPPER_SNAKE_CASE
- 文件：kebab-case 或 camelCase

### TypeScript 规范
- 严格模式开启
- 所有函数返回值必须声明类型
- Props 使用 interface 定义
- 避免使用 `any`
- 使用 `@/*` 路径别名

### API 路由规范
```typescript
// 必须的错误处理结构
export async function POST(request: NextRequest) {
  try {
    // 1. 参数验证
    // 2. 业务逻辑
    // 3. 返回统一格式
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { success: false, error: '错误信息' },
      { status: 500 }
    );
  }
}
```

### 错误处理
- 所有 async/await 使用 try-catch
- API 返回统一格式：`{ success: boolean, data?: any, error?: string }`
- 控制台必须输出错误日志
- 用户界面显示友好错误提示

### 组件开发
- 使用 'use client' 指令标记客户端组件
- shadcn/ui 组件在 `components/ui/`
- 状态管理使用 React Hooks
- 支持批量操作的组件需有进度条

### 样式规范
- 使用 Tailwind CSS 工具类
- 颜色使用 CSS 变量（shadcn 标准）
- 响应式前缀：sm:, md:, lg:
- 组件间距统一使用 4 的倍数

### Git 提交
- 提交信息用中文
- 格式：`<类型>: <描述>`
- 类型：feat, fix, docs, style, refactor, test, chore

### 性能注意
- 批量操作添加延迟避免限流
- 图片使用 Next.js Image 组件
- API 路由使用 Edge Runtime（可选）

### 安全规范
- 绝不提交 .env.local
- API Key 存储在环境变量
- 用户输入必须验证
- CORS 通过 API 路由代理处理

---
生成命令参考，禁止超出用户要求的范围。

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Downloader - 多平台内容解析下载工具",
  description: "统一解析抖音、快手、视频号、TikTok、小红书、公众号、X、Bilibili、YouTube、知乎、小宇宙链接，支持单条和批量解析",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body className="min-h-screen bg-background font-sans antialiased">
        {children}
      </body>
    </html>
  );
}

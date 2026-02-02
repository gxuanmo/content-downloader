import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Content Downloader - 免费下载知乎/小宇宙/B站内容",
  description: "免费下载知乎文章、小宇宙播客、B站视频，支持批量下载",
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

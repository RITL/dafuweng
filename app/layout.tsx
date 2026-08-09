import type { Metadata } from "next";
import "./globals.css";

const publicBasePath = process.env.GITHUB_PAGES === "true" ? "/dafuweng" : "";

export const metadata: Metadata = {
  title: "环球大富翁｜我们的家庭旅行局",
  description: "适合家庭同屏和电视投屏的世界城市大富翁网页游戏。",
  manifest: `${publicBasePath}/manifest.webmanifest`,
  applicationName: "环球大富翁",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "环球大富翁",
  },
  formatDetection: { telephone: false },
  icons: {
    icon: `${publicBasePath}/favicon.svg`,
    shortcut: `${publicBasePath}/favicon.svg`,
    apple: `${publicBasePath}/icons/apple-touch-icon.png`,
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}

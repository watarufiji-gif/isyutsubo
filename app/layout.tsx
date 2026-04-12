import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "課税移出簿 - 酒蔵在庫管理",
  description: "課税移出簿 酒蔵在庫管理システム",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700;900&display=swap"
          rel="stylesheet"
        />
        {/* D3.js + TopoJSON: マップ描画に使用。inventory-app.js より先に読み込む必要がある */}
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.jsdelivr.net/npm/d3@7/dist/d3.min.js"></script>
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script src="https://cdn.jsdelivr.net/npm/topojson-client@3/dist/topojson-client.min.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}

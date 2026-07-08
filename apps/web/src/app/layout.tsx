import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "e-tawafsai — Platform Umrah Terpercaya",
  description:
    "Temukan paket umrah terbaik dari agen perjalanan terpercaya. Harga transparan, hotel bintang 5, bimbingan ibadah lengkap.",
  keywords: [
    "umrah",
    "paket umrah",
    "travel umrah",
    "umrah murah",
    "umrah 2026",
    "haji",
    "e-tawafsai",
  ],
  openGraph: {
    title: "e-tawafsai — Platform Umrah Terpercaya",
    description:
      "Temukan paket umrah terbaik dari agen perjalanan terpercaya.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <head>
        {/*
          Fonts via <link> so builds never need network access.
          Playfair Display = elegant serif for headings.
          Inter = clean sans-serif for body/UI.
          IBM Plex Mono = prices, dates, IDs.
        */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

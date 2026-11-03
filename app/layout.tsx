import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TodayOnline Leadsysteem",
  description: "Kwalificeer prospects en beheer je leads.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=League+Spartan:wght@500;600;700&family=Figtree:wght@400;500;600&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Caster — 24/7 AI-Powered Radio",
  description: "Live internet radio powered by AI DJ technology",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="theme-color" content="#202020" />
      </head>
      <body>{children}</body>
    </html>
  );
}

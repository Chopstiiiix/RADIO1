import type { Metadata } from "next";
import "./globals.css";
import MobileEnhancements from "./components/MobileEnhancements";

export const metadata: Metadata = {
  title: "Caster — 24/7 AI-Powered Radio",
  description: "Live internet radio powered by AI DJ technology",
  other: {
    "apple-mobile-web-app-capable": "yes",
    "apple-mobile-web-app-status-bar-style": "black-translucent",
    "theme-color": "#202020",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <MobileEnhancements />
        {children}
      </body>
    </html>
  );
}

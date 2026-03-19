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
      <body>{children}</body>
    </html>
  );
}

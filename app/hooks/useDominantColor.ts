"use client";

import { useState, useEffect } from "react";

const colorCache = new Map<string, string>();

/**
 * Extracts the dominant color from an image URL.
 * Returns an rgba string like "rgb(120, 40, 60)".
 * Falls back to null if image can't be loaded.
 */
export function useDominantColor(imageUrl: string | null | undefined): string | null {
  const [color, setColor] = useState<string | null>(
    imageUrl && colorCache.has(imageUrl) ? colorCache.get(imageUrl)! : null
  );

  useEffect(() => {
    if (!imageUrl) { setColor(null); return; }
    if (colorCache.has(imageUrl)) { setColor(colorCache.get(imageUrl)!); return; }

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imageUrl;

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        // Sample at small size for performance
        const size = 32;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        ctx.drawImage(img, 0, 0, size, size);
        const data = ctx.getImageData(0, 0, size, size).data;

        // Bucket colors and find the most frequent non-dark, non-white color
        const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const a = data[i + 3];

          // Skip transparent pixels
          if (a < 128) continue;

          // Skip very dark or very bright pixels
          const brightness = (r + g + b) / 3;
          if (brightness < 30 || brightness > 230) continue;

          // Bucket by reducing precision (group similar colors)
          const kr = Math.round(r / 32) * 32;
          const kg = Math.round(g / 32) * 32;
          const kb = Math.round(b / 32) * 32;
          const key = `${kr},${kg},${kb}`;

          const existing = buckets.get(key);
          if (existing) {
            existing.r += r;
            existing.g += g;
            existing.b += b;
            existing.count++;
          } else {
            buckets.set(key, { r, g, b, count: 1 });
          }
        }

        // Find the most frequent bucket
        let best: { r: number; g: number; b: number; count: number } | null = null;
        for (const bucket of buckets.values()) {
          if (!best || bucket.count > best.count) {
            best = bucket;
          }
        }

        if (best && best.count > 0) {
          const avgR = Math.round(best.r / best.count);
          const avgG = Math.round(best.g / best.count);
          const avgB = Math.round(best.b / best.count);
          const result = `rgb(${avgR}, ${avgG}, ${avgB})`;
          colorCache.set(imageUrl, result);
          setColor(result);
        }
      } catch {
        // Canvas tainted or other error — ignore
      }
    };

    img.onerror = () => {
      // Image failed to load
    };
  }, [imageUrl]);

  return color;
}

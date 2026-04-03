"use client";

import { useEffect, useRef } from "react";
import { hapticTap, isNative } from "../../lib/capacitor-bridge";

/**
 * Global mobile enhancements:
 * - Pull-to-refresh (swipe down to reload)
 * - Haptic feedback on every page load
 * - Haptic feedback on every button/link CTA click
 */
export default function MobileEnhancements() {
  const startY = useRef(0);
  const pulling = useRef(false);

  useEffect(() => {
    // Haptic on page load
    hapticTap();

    // Pull-to-refresh: detect swipe down at top of page
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 120 && window.scrollY === 0) {
        pulling.current = false;
        hapticTap();
        window.location.reload();
      }
    };

    const onTouchEnd = () => {
      pulling.current = false;
    };

    // Haptic on every CTA click (buttons, links with styling)
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const clickable = target.closest("button, a[href], [role='button']");
      if (clickable) {
        hapticTap();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("click", onClick, { capture: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("click", onClick, { capture: true });
    };
  }, []);

  return null;
}

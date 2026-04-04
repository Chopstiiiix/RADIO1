"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTap, isNative } from "../../lib/capacitor-bridge";

/**
 * Global mobile enhancements:
 * - Pull-to-refresh with stretch + bounce effect
 * - Haptic feedback on every page load
 * - Haptic feedback on every button/link CTA click
 */
export default function MobileEnhancements() {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [releasing, setReleasing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const threshold = 100;

  useEffect(() => {
    // Haptic on page load
    hapticTap();

    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY <= 0 && !refreshing) {
        startY.current = e.touches[0].clientY;
        pulling.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshing) return;
      const diff = e.touches[0].clientY - startY.current;
      if (diff > 0 && window.scrollY <= 0) {
        // Rubber-band effect — diminishing returns as you pull further
        const dampened = Math.min(diff * 0.4, 160);
        setPullDistance(dampened);
      } else {
        setPullDistance(0);
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (pullDistance >= threshold) {
        // Trigger refresh
        hapticTap();
        setRefreshing(true);
        setReleasing(true);
        setPullDistance(50); // Snap to loading position

        // Bounce then reload
        setTimeout(() => {
          window.location.reload();
        }, 400);
      } else {
        // Bounce back
        setReleasing(true);
        setPullDistance(0);
        setTimeout(() => setReleasing(false), 300);
      }
    };

    // Haptic on every CTA click
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
  }, [pullDistance, refreshing]);

  if (pullDistance === 0 && !releasing) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: "env(safe-area-inset-top, 0px)",
        left: 0,
        right: 0,
        zIndex: 99998,
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        height: `${pullDistance}px`,
        overflow: "hidden",
        transition: releasing ? "height 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)" : "none",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          width: "28px",
          height: "28px",
          borderRadius: "50%",
          border: "2px solid #f59e0b",
          borderTopColor: pullDistance >= threshold || refreshing ? "#f59e0b" : "transparent",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: Math.min(pullDistance / threshold, 1),
          transform: refreshing
            ? "rotate(360deg)"
            : `rotate(${(pullDistance / threshold) * 360}deg)`,
          transition: releasing
            ? "transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease"
            : "none",
          animation: refreshing ? "ptr-spin 0.6s linear infinite" : "none",
        }}
      >
        {!refreshing && pullDistance >= threshold && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        )}
      </div>
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

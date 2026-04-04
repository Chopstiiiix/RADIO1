"use client";

import { useEffect, useRef, useState } from "react";
import { hapticTap } from "../../lib/capacitor-bridge";

/**
 * Global mobile enhancements:
 * - Pull-to-refresh: entire page moves down, spring bounce back
 * - Haptic feedback on page load and CTA clicks
 */
export default function MobileEnhancements() {
  const startY = useRef(0);
  const pulling = useRef(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "releasing" | "refreshing">("idle");
  const threshold = 90;
  const maxPull = 150;

  useEffect(() => {
    hapticTap();

    const onTouchStart = (e: TouchEvent) => {
      if (phase === "refreshing") return;
      // Check if we're at the top of any scroll container
      const target = e.target as HTMLElement;
      let el: HTMLElement | null = target;
      while (el && el !== document.body) {
        if (el.scrollTop > 0) return; // inside a scrolled container — don't intercept
        const style = getComputedStyle(el);
        if (style.overflowY === "auto" || style.overflowY === "scroll") {
          if (el.scrollTop > 0) return;
        }
        el = el.parentElement;
      }
      if (window.scrollY > 0) return;

      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || phase === "refreshing") return;
      const diff = e.touches[0].clientY - startY.current;

      if (diff > 0) {
        // Rubber-band dampening: pull harder → less movement
        const dampened = maxPull * (1 - Math.exp(-diff / 200));
        setPullDistance(dampened);
        setPhase("pulling");
      } else {
        setPullDistance(0);
        if (phase === "pulling") setPhase("idle");
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) return;
      pulling.current = false;

      if (pullDistance >= threshold) {
        hapticTap();
        setPhase("refreshing");
        // Snap to loading position then reload
        setPullDistance(60);
        setTimeout(() => {
          window.location.reload();
        }, 500);
      } else {
        // Spring bounce back
        setPhase("releasing");
        setPullDistance(0);
        setTimeout(() => setPhase("idle"), 400);
      }
    };

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("button, a[href], [role='button']")) {
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
  }, [pullDistance, phase]);

  // Apply transform to the entire page
  useEffect(() => {
    const root = document.getElementById("app-root") || document.body;
    if (!root) return;

    if (phase === "pulling") {
      root.style.transition = "none";
      root.style.transform = `translateY(${pullDistance}px)`;
    } else if (phase === "releasing") {
      root.style.transition = "transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)";
      root.style.transform = "translateY(0)";
    } else if (phase === "refreshing") {
      root.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
      root.style.transform = `translateY(${pullDistance}px)`;
    } else {
      root.style.transition = "";
      root.style.transform = "";
    }
  }, [pullDistance, phase]);

  const showSpinner = phase !== "idle";
  const progress = Math.min(pullDistance / threshold, 1);

  return (
    <>
      {showSpinner && (
        <div
          style={{
            position: "fixed",
            top: `calc(env(safe-area-inset-top, 0px) + ${Math.max(pullDistance - 40, 0)}px)`,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 99999,
            pointerEvents: "none",
            transition: phase === "releasing"
              ? "top 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.3s ease"
              : phase === "refreshing"
                ? "top 0.3s ease"
                : "none",
            opacity: progress,
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "rgba(32, 32, 32, 0.9)",
              border: pullDistance >= threshold ? "2px solid #f59e0b" : "2px solid rgba(245, 158, 11, 0.4)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              animation: phase === "refreshing" ? "ptr-spin 0.6s linear infinite" : "none",
              transform: phase !== "refreshing" ? `rotate(${progress * 360}deg)` : undefined,
              transition: phase === "releasing" ? "transform 0.3s ease, border-color 0.2s" : "none",
            }}
          >
            {phase === "refreshing" ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12a9 9 0 1 1-6.2-8.6" />
              </svg>
            ) : pullDistance >= threshold ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: progress }}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <polyline points="19 12 12 19 5 12" />
              </svg>
            )}
          </div>
        </div>
      )}
      <style>{`
        @keyframes ptr-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}

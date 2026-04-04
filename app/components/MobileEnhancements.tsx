"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { hapticTap } from "../../lib/capacitor-bridge";

/**
 * Global mobile enhancements:
 * - Pull-to-refresh: entire page moves down, spring bounce back
 * - Haptic feedback on page load and CTA clicks
 *
 * Key design: pull tracking only activates on confirmed downward gesture.
 * Upward swipes are completely ignored so native scroll momentum is never stolen.
 */
export default function MobileEnhancements() {
  const startY = useRef(0);
  const canPull = useRef(false);    // eligible (at scroll top)
  const pulling = useRef(false);    // confirmed downward pull
  const decided = useRef(false);    // direction decided for this gesture
  const phaseRef = useRef<"idle" | "pulling" | "releasing" | "refreshing">("idle");
  const pullRef = useRef(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [phase, setPhase] = useState<"idle" | "pulling" | "releasing" | "refreshing">("idle");
  const threshold = 90;
  const maxPull = 150;

  const updatePhase = useCallback((p: typeof phase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const updatePull = useCallback((d: number) => {
    pullRef.current = d;
    setPullDistance(d);
  }, []);

  useEffect(() => {
    hapticTap();

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current === "refreshing") return;

      // Reset gesture state
      canPull.current = false;
      pulling.current = false;
      decided.current = false;

      // Ignore touches inside drag-controlled components (date wheel, carousels)
      const target = e.target as HTMLElement;
      if (target.closest("[data-slot='carousel'], [role='spinbutton']")) return;

      // Check if at top of scroll — if not, bail completely
      let el: HTMLElement | null = target;
      while (el && el !== document.body) {
        if (el.scrollTop > 0) return;
        el = el.parentElement;
      }
      if (window.scrollY > 0) return;

      // No pull-to-refresh on auth pages (no app-root)
      if (!document.getElementById("app-root")) return;

      // Mark as eligible, but DON'T activate pull yet
      startY.current = e.touches[0].clientY;
      canPull.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!canPull.current || phaseRef.current === "refreshing") return;

      const diff = e.touches[0].clientY - startY.current;

      // First move decides direction — only decide once per gesture
      if (!decided.current) {
        decided.current = true;
        if (diff <= 0) {
          // Swiping UP — completely release this gesture to native scroll
          canPull.current = false;
          return;
        }
        // Swiping DOWN — activate pull-to-refresh
        pulling.current = true;
      }

      if (!pulling.current) return;

      if (diff > 0) {
        const dampened = maxPull * (1 - Math.exp(-diff / 200));
        updatePull(dampened);
        updatePhase("pulling");
      } else {
        updatePull(0);
        if (phaseRef.current === "pulling") updatePhase("idle");
      }
    };

    const onTouchEnd = () => {
      if (!pulling.current) {
        canPull.current = false;
        return;
      }
      pulling.current = false;
      canPull.current = false;

      if (pullRef.current >= threshold) {
        hapticTap();
        updatePhase("refreshing");
        updatePull(60);
        setTimeout(() => window.location.reload(), 500);
      } else {
        updatePhase("releasing");
        updatePull(0);
        setTimeout(() => updatePhase("idle"), 400);
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
  }, []);

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

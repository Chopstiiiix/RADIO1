"use client";

import { useRouter } from "next/navigation";
import { useRef, useEffect, useState } from "react";

export default function IntroPage() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [canPlay, setCanPlay] = useState(false);

  useEffect(() => {
    // Check if user has seen the intro this session
    if (sessionStorage.getItem("cstr_intro_seen")) {
      router.replace("/login");
      return;
    }

    const video = videoRef.current;
    if (!video) return;

    const onCanPlay = () => setCanPlay(true);
    const onEnded = () => {
      sessionStorage.setItem("cstr_intro_seen", "1");
      router.replace("/login");
    };
    const onError = () => {
      // If video fails to load, skip to login
      sessionStorage.setItem("cstr_intro_seen", "1");
      router.replace("/login");
    };

    video.addEventListener("canplaythrough", onCanPlay);
    video.addEventListener("ended", onEnded);
    video.addEventListener("error", onError);

    // Auto-play with sound muted (required by mobile browsers)
    video.muted = true;
    video.play().catch(() => {
      // Autoplay blocked — skip to login
      router.replace("/login");
    });

    // Safety timeout — skip after 7 seconds regardless
    const timeout = setTimeout(() => {
      sessionStorage.setItem("cstr_intro_seen", "1");
      router.replace("/login");
    }, 7000);

    return () => {
      clearTimeout(timeout);
      video.removeEventListener("canplaythrough", onCanPlay);
      video.removeEventListener("ended", onEnded);
      video.removeEventListener("error", onError);
    };
  }, [router]);

  const skip = () => {
    sessionStorage.setItem("cstr_intro_seen", "1");
    router.replace("/login");
  };

  return (
    <div
      onClick={skip}
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "#000",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        cursor: "pointer",
      }}
    >
      <video
        ref={videoRef}
        src="/video/intro.m4v"
        playsInline
        muted
        preload="auto"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
        }}
      />
      {canPlay && (
        <button
          onClick={(e) => { e.stopPropagation(); skip(); }}
          style={{
            position: "absolute",
            top: "env(safe-area-inset-top, 16px)",
            right: "16px",
            marginTop: "16px",
            background: "none",
            border: "1px solid rgba(255,255,255,0.2)",
            color: "rgba(255,255,255,0.5)",
            padding: "6px 14px",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            cursor: "pointer",
          }}
        >
          Skip
        </button>
      )}
    </div>
  );
}

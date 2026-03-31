"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Hls from "hls.js";

const STREAM_BASE =
  process.env.NEXT_PUBLIC_STREAM_URL ||
  (typeof window !== "undefined" ? window.location.origin : "");

function getStreamUrl(slug?: string) {
  const base = STREAM_BASE || "";
  return slug
    ? `${base}/stream/${slug}/stream.m3u8`
    : `${base}/stream/default/stream.m3u8`;
}

export function useStream(trackStartOffset: number, trackDuration: number, slug?: string) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number>(0);

  const setupAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;

    const ctx = new AudioContext();
    // Resume AudioContext on mobile (requires user gesture)
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxRef.current = ctx;
    setAnalyserNode(analyser);
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const audio = audioRef.current;
      if (audio && isFinite(audio.currentTime)) {
        const globalPos = audio.currentTime;
        const trackElapsed = globalPos - trackStartOffset;
        setElapsed(Math.max(0, Math.min(trackElapsed, trackDuration)));
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, trackStartOffset, trackDuration]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  const stop = useCallback(() => {
    const audio = audioRef.current;
    if (audio) audio.pause();
    hlsRef.current?.destroy();
    hlsRef.current = null;
    setIsPlaying(false);
    setElapsed(0);
  }, []);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      stop();
      return;
    }

    setupAnalyser();
    const streamUrl = getStreamUrl(slug);

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 2,
        liveMaxLatencyDurationCount: 3,
        liveDurationInfinity: true,
        highBufferWatchdogPeriod: 1,
        maxBufferLength: 4,
        maxMaxBufferLength: 8,
      });
      hls.loadSource(streamUrl);
      hls.attachMedia(audio);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        audio.play();
        setIsPlaying(true);
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error("HLS fatal error:", data.type);
          stop();
        }
      });
      hlsRef.current = hls;
    } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
      audio.src = streamUrl;
      audio.play();
      setIsPlaying(true);
    }
  }, [isPlaying, setupAnalyser, stop, slug]);

  const skipNext = useCallback(() => {
    if (!isPlaying) return;
    const audio = audioRef.current;
    const hls = hlsRef.current;
    if (hls && audio && hls.liveSyncPosition) {
      audio.currentTime = hls.liveSyncPosition;
    }
  }, [isPlaying]);

  const skipPrev = useCallback(() => {
    const audio = audioRef.current;
    if (audio && isFinite(audio.currentTime)) {
      audio.currentTime = Math.max(0, audio.currentTime - 30);
    }
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const changeVolume = useCallback((v: number) => {
    setVolume(Math.max(0, Math.min(1, v)));
    if (v > 0) setIsMuted(false);
  }, []);

  useEffect(() => {
    return () => {
      hlsRef.current?.destroy();
      audioCtxRef.current?.close();
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    isPlaying, toggle, stop, audioRef, analyserNode,
    elapsed,
    skipNext, skipPrev,
    volume, isMuted, toggleMute, changeVolume,
  };
}

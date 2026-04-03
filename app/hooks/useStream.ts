"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Hls from "hls.js";
import {
  activateAudioSession,
  startNativeAnalyser,
  stopNativeAnalyser,
  onFrequencyData,
} from "../../lib/capacitor-bridge";

function getStreamUrl(slug?: string) {
  const path = slug
    ? `/stream/${slug}/stream.m3u8`
    : "/stream/default/stream.m3u8";

  // Prefer the app's rewrite/proxy so listeners stay on the same origin.
  if (typeof window !== "undefined") {
    return path;
  }

  const base = process.env.NEXT_PUBLIC_STREAM_URL?.replace(/\/$/, "") || "";
  return `${base}${path}`;
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
  const nativeCleanupRef = useRef<(() => void) | null>(null);

  const setupAnalyser = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || audioCtxRef.current) return;

    // Activate native audio session for background playback (no-op on web)
    activateAudioSession();

    const ctx = new AudioContext();
    // Resume AudioContext on mobile (requires user gesture)
    if (ctx.state === "suspended") {
      ctx.resume();
    }

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;

    // On iOS with native HLS, createMediaElementSource doesn't feed frequency
    // data. Use the native AudioAnalyser plugin to capture frequency data from
    // the system audio output and inject it into the AnalyserNode's interface.
    const useNativeHls = !Hls.isSupported() && !!audio.canPlayType("application/vnd.apple.mpegurl");

    if (!useNativeHls) {
      // Desktop / HLS.js path: pipe audio through AudioContext
      const source = ctx.createMediaElementSource(audio);
      source.connect(analyser);
      analyser.connect(ctx.destination);
    } else {
      // iOS native HLS path: use native plugin for frequency data.
      // Create a buffer that the native plugin writes into, and override
      // getByteFrequencyData to read from it instead of the (empty) AudioContext.
      const nativeBins = new Uint8Array(analyser.frequencyBinCount);
      const originalGetByteFrequencyData = analyser.getByteFrequencyData.bind(analyser);

      analyser.getByteFrequencyData = (array: Uint8Array) => {
        // Try native data first; fall back to original (empty) if no native data
        if (nativeBins.some((v) => v > 0)) {
          array.set(nativeBins.subarray(0, array.length));
        } else {
          originalGetByteFrequencyData(array as Uint8Array<ArrayBuffer>);
        }
      };

      // Start native analysis and listen for frequency data
      startNativeAnalyser();
      const removeListener = onFrequencyData((bins) => {
        // Resample native bins (128) to analyser's frequencyBinCount (128)
        const len = Math.min(bins.length, nativeBins.length);
        for (let i = 0; i < len; i++) nativeBins[i] = bins[i];
      });

      nativeCleanupRef.current = () => {
        stopNativeAnalyser();
        removeListener();
      };
    }

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
    nativeCleanupRef.current?.();
    nativeCleanupRef.current = null;
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

  /** Try to autoplay the stream. Returns true if playback started, false if browser blocked it. */
  const autoplay = useCallback((): Promise<boolean> => {
    return new Promise((resolve) => {
      const audio = audioRef.current;
      if (!audio || isPlaying) { resolve(isPlaying); return; }

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
          audio.play()
            .then(() => { setIsPlaying(true); resolve(true); })
            .catch(() => resolve(false)); // browser blocked autoplay
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (data.fatal) { stop(); resolve(false); }
        });
        hlsRef.current = hls;
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = streamUrl;
        audio.play()
          .then(() => { setIsPlaying(true); resolve(true); })
          .catch(() => resolve(false));
      } else {
        resolve(false);
      }
    });
  }, [isPlaying, setupAnalyser, stop, slug]);

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
      nativeCleanupRef.current?.();
      nativeCleanupRef.current = null;
      cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return {
    isPlaying, toggle, stop, autoplay, audioRef, analyserNode,
    elapsed,
    skipNext, skipPrev,
    volume, isMuted, toggleMute, changeVolume,
  };
}

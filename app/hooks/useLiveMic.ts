"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Room, RoomEvent, Track, RemoteTrackPublication, RemoteParticipant } from "livekit-client";
import { activateAudioSession } from "../../lib/capacitor-bridge";

/**
 * Hook for listeners to receive live mic audio via LiveKit WebRTC.
 * Returns an analyser node for the visualizer and connection state.
 */
export function useLiveMic(slug: string, isLiveMic: boolean) {
  const [connected, setConnected] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const roomRef = useRef<Room | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);

  const connect = useCallback(async () => {
    if (roomRef.current) return; // already connected

    try {
      // Get token from backend
      const res = await fetch("/api/livekit/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          identity: `listener-${Math.random().toString(36).slice(2, 8)}`,
          slug,
          role: "listener",
        }),
      });
      const { token, livekitUrl } = await res.json();
      if (!token || !livekitUrl) return;

      const room = new Room({ adaptiveStream: true });
      roomRef.current = room;

      room.on(RoomEvent.TrackSubscribed, async (track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = "none";
          document.body.appendChild(el);
          audioElRef.current = el;

          // Activate native audio session for background playback (no-op on web)
          await activateAudioSession();

          // Create analyser for visualizer
          if (!audioCtxRef.current) {
            const ctx = new AudioContext();
            const source = ctx.createMediaElementSource(el);
            const analyser = ctx.createAnalyser();
            analyser.fftSize = 256;
            source.connect(analyser);
            analyser.connect(ctx.destination);
            audioCtxRef.current = ctx;
            setAnalyserNode(analyser);
          }
        }
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      room.on(RoomEvent.Disconnected, () => {
        setConnected(false);
      });

      await room.connect(livekitUrl, token);
      setConnected(true);
    } catch (err) {
      console.error("LiveKit connect error:", err);
    }
  }, [slug]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
    }
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current.remove();
      audioElRef.current = null;
    }
    setConnected(false);
    setAnalyserNode(null);
  }, []);

  // Auto-connect when live_mic mode is detected, auto-disconnect when it ends
  useEffect(() => {
    if (isLiveMic) {
      connect();
    } else {
      disconnect();
    }
    return () => { disconnect(); };
  }, [isLiveMic, connect, disconnect]);

  return { connected, analyserNode, connect, disconnect };
}

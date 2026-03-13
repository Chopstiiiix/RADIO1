"use client";

import { useState, useEffect } from "react";
import type { TrackInfo } from "../components/NowPlaying";
import type { UpcomingTrack } from "../components/Schedule";

function getMetadataUrl() {
  if (typeof window === "undefined") return "http://localhost:8001/now-playing";
  return `http://${window.location.hostname}:8001/now-playing`;
}

interface MetadataState {
  isLive: boolean;
  track: TrackInfo | null;
  upcoming: UpcomingTrack[];
  duration: number;
  trackStartOffset: number;
  ended: boolean;
}

export function useMetadata(): MetadataState {
  const [state, setState] = useState<MetadataState>({
    isLive: false,
    track: null,
    upcoming: [],
    duration: 0,
    trackStartOffset: 0,
    ended: false,
  });

  useEffect(() => {
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      const url = getMetadataUrl();
      eventSource = new EventSource(url);

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setState((prev) => ({
            ...prev,
            isLive: !data.ended,
            track: data.track ?? null,
            upcoming: data.upcoming ?? [],
            duration: data.duration ?? prev.duration,
            trackStartOffset: data.trackStartOffset ?? prev.trackStartOffset,
            ended: data.ended ?? false,
          }));
        } catch {
          // ignore
        }
      };

      eventSource.onerror = () => {
        setState((prev) => ({ ...prev, isLive: false }));
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    };

    connect();
    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, []);

  return state;
}

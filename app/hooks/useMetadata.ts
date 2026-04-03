"use client";

import { useState, useEffect } from "react";
import type { TrackInfo } from "../components/NowPlaying";
import type { UpcomingTrack } from "../components/Schedule";
import { updateMediaSession } from "../../lib/capacitor-bridge";

function getMetadataUrl() {
  if (typeof window === "undefined") return "/metadata/channels/default/now-playing";
  return `${window.location.origin}/metadata/channels/default/now-playing`;
}

interface MetadataState {
  isLive: boolean;
  track: TrackInfo | null;
  upcoming: UpcomingTrack[];
  duration: number;
  trackStartOffset: number;
  ended: boolean;
  type: "track" | "host_segment" | "advert";
}

export function useMetadata(): MetadataState {
  const [state, setState] = useState<MetadataState>({
    isLive: false,
    track: null,
    upcoming: [],
    duration: 0,
    trackStartOffset: 0,
    ended: false,
    type: "track",
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
          const rawTrack = data.track;
          const track = rawTrack ? {
            title: rawTrack.title,
            artist: rawTrack.artist,
            artwork: rawTrack.artwork_url || rawTrack.artwork,
          } : null;
          setState((prev) => ({
            ...prev,
            isLive: !data.ended,
            track,
            upcoming: data.upcoming ?? [],
            duration: data.duration ?? prev.duration,
            trackStartOffset: data.trackStartOffset ?? prev.trackStartOffset,
            ended: data.ended ?? false,
            type: data.type ?? "track",
          }));

          // Update lock screen / Control Center metadata
          if (track) {
            updateMediaSession({
              title: track.title ?? "Caster Radio",
              artist: track.artist ?? "Live",
              artwork: track.artwork,
            });
          }
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

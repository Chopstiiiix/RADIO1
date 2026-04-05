"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import TrashButton from "@/app/components/TrashButton";
import BroadcastAgreement from "@/app/components/BroadcastAgreement";
import ScheduleModal from "@/app/components/ScheduleModal";
import InlineLoader from "@/app/components/InlineLoader";
import { useDominantColor } from "@/app/hooks/useDominantColor";

interface Track {
  id: string;
  title: string;
  primary_artist: string;
  featured_artists: string[] | null;
  producer: string | null;
  genre: string[] | null;
  duration_seconds: number | null;
  is_active: boolean;
  uploaded_at: string;
  artwork_url: string | null;
  position: number | null;
}

interface ApprovedAd {
  id: string;         // ad_request id
  advert_id: string;
  title: string;
  description: string | null;
  file_url: string | null;
  duration_seconds: number | null;
  advertiser_name: string;
}

type QueueItem =
  | { type: "track"; id: string; data: Track }
  | { type: "advert"; id: string; data: ApprovedAd };

const MAX_ADS_PER_WINDOW = 1;
const AD_WINDOW_SIZE = 15;

export default function TracksPage() {
  const supabase = createClient();
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTracks, setSelectedTracks] = useState<Set<string>>(new Set());
  const [broadcasting, setBroadcasting] = useState(false);
  const [broadcastMessage, setBroadcastMessage] = useState("");
  const [nowPlayingTitle, setNowPlayingTitle] = useState<string | null>(null);
  const [broadcastingTitles, setBroadcastingTitles] = useState<Set<string>>(new Set());
  const [channelSlug, setChannelSlug] = useState<string | null>(null);
  const [isChannelLive, setIsChannelLive] = useState(false);
  const [endingBroadcast, setEndingBroadcast] = useState(false);
  const [showAgreement, setShowAgreement] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [schedulingMessage, setSchedulingMessage] = useState("");
  const [broadcastStartedAt, setBroadcastStartedAt] = useState(0);
  const [broadcasterId, setBroadcasterId] = useState<string | null>(null);
  const [approvedAds, setApprovedAds] = useState<ApprovedAd[]>([]);
  const [queue, setQueue] = useState<QueueItem[]>([]);

  async function handleSchedule(scheduledAt: string) {
    if (selectedTracks.size === 0) return;
    setShowSchedule(false);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { error } = await supabase.from("scheduled_broadcasts").insert({
      broadcaster_id: user.id,
      scheduled_at: scheduledAt,
      track_ids: Array.from(selectedTracks),
    });

    if (error) {
      setBroadcastMessage(error.message);
    } else {
      const d = new Date(scheduledAt);
      setSchedulingMessage(`Broadcast scheduled for ${d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`);
      setSelectedTracks(new Set());
      setTimeout(() => setSchedulingMessage(""), 5000);
    }
  }

  async function loadTracks() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setBroadcasterId(user.id);

    const [trackRes, adRes] = await Promise.all([
      supabase
        .from("tracks")
        .select("id, title, primary_artist, featured_artists, producer, genre, duration_seconds, is_active, uploaded_at, artwork_url, position")
        .eq("broadcaster_id", user.id)
        .order("position", { ascending: true, nullsFirst: false })
        .order("uploaded_at", { ascending: false }),
      supabase
        .from("ad_requests")
        .select(`
          id, frequency,
          advert:adverts(id, title, description, file_url, duration_seconds),
          advertiser:profiles!ad_requests_advertiser_id_fkey(display_name)
        `)
        .eq("broadcaster_id", user.id)
        .eq("status", "approved"),
    ]);

    const loadedTracks = trackRes.data || [];
    setTracks(loadedTracks);

    // Parse approved ads into flat structure
    const ads: ApprovedAd[] = ((adRes.data as any) || []).map((r: any) => ({
      id: r.id,
      advert_id: r.advert?.id,
      title: r.advert?.title || "Ad",
      description: r.advert?.description,
      file_url: r.advert?.file_url,
      duration_seconds: r.advert?.duration_seconds,
      advertiser_name: r.advertiser?.display_name || "Advertiser",
    }));
    setApprovedAds(ads);

    // Build initial queue from tracks only (ads can be inserted by broadcaster)
    // Preserve existing queue if tracks haven't changed
    setQueue(prev => {
      if (prev.length === 0) {
        return loadedTracks.filter(t => t.is_active).map(t => ({ type: "track" as const, id: t.id, data: t }));
      }
      // Update existing queue items with fresh data, remove deleted, keep ad positions
      const trackMap = new Map(loadedTracks.map(t => [t.id, t]));
      const updated: QueueItem[] = [];
      for (const item of prev) {
        if (item.type === "track") {
          const fresh = trackMap.get(item.id);
          if (fresh && fresh.is_active) updated.push({ type: "track", id: fresh.id, data: fresh });
        } else {
          const freshAd = ads.find(a => a.id === item.id);
          if (freshAd) updated.push({ type: "advert", id: freshAd.id, data: freshAd });
        }
      }
      // Add any new active tracks not already in queue
      for (const t of loadedTracks) {
        if (t.is_active && !updated.some(q => q.type === "track" && q.id === t.id)) {
          updated.push({ type: "track", id: t.id, data: t });
        }
      }
      return updated;
    });

    setLoading(false);

    // Always fetch channel slug and live status
    const { data: ch } = await supabase
      .from("broadcaster_profiles")
      .select("channel_slug, is_live")
      .eq("id", user.id)
      .single();
    if (ch?.channel_slug) {
      setChannelSlug(ch.channel_slug);
      // Only show as live if broadcast is in tracks mode (not mic-live)
      if (ch.is_live) {
        try {
          const metaRes = await fetch(`/metadata/api/channels/${ch.channel_slug}/now-playing`);
          if (metaRes.ok) {
            const meta = await metaRes.json();
            setIsChannelLive(meta.mode !== "live_mic" && !meta.ended);
          } else {
            setIsChannelLive(false);
          }
        } catch {
          setIsChannelLive(ch.is_live);
        }
      } else {
        setIsChannelLive(false);
      }
    }
  }

  useEffect(() => { loadTracks(); }, []);

  // Poll live status every 5 seconds to catch broadcast end if SSE misses it
  useEffect(() => {
    if (!channelSlug || !isChannelLive) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/metadata/api/channels/${channelSlug}/now-playing`);
        if (res.ok) {
          const meta = await res.json();
          if (meta.ended) {
            setNowPlayingTitle(null);
            setBroadcastingTitles(new Set());
            setIsChannelLive(false);
            setBroadcastStartedAt(0);
            setBroadcastMessage("Broadcast ended — all tracks finished");
          }
        }
      } catch { /* ignore */ }
    }, 5000);
    return () => clearInterval(interval);
  }, [channelSlug, isChannelLive]);

  // Fetch the full broadcast queue to know which tracks are in rotation
  useEffect(() => {
    if (!channelSlug || !isChannelLive) return;
    async function fetchQueue() {
      try {
        const res = await fetch(`/api/channels/${channelSlug}/queue`);
        if (res.ok) {
          const data = await res.json();
          if (data.queue && Array.isArray(data.queue)) {
            const titles = new Set<string>();
            for (const filename of data.queue) {
              // Strip extension and normalize to match track titles
              const name = filename.replace(/\.[^.]+$/, "");
              titles.add(normalize(name));
            }
            setBroadcastingTitles(titles);
          }
        }
      } catch { /* ignore */ }
    }
    fetchQueue();
  }, [channelSlug, isChannelLive]);

  // SSE: track currently playing
  useEffect(() => {
    if (!channelSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/metadata/channels/${channelSlug}/now-playing`;
    const es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.track && !data.ended) {
          // Only show as live on tracks page if broadcast is in tracks mode
          // (mic-live from go-live page is independent)
          if (data.mode === "live_mic") {
            setNowPlayingTitle(null);
            setBroadcastingTitles(new Set());
            setIsChannelLive(false);
          } else {
            setNowPlayingTitle(data.track.title);
            if (!isChannelLive) setIsChannelLive(true);
          }
        } else if (data.ended) {
          // Ignore stale ended events within 10 seconds of starting a broadcast
          const timeSinceStart = Date.now() - broadcastStartedAt;
          if (broadcastStartedAt > 0 && timeSinceStart < 10000) {
            // Stale event from startup — ignore
          } else {
            // Broadcast has naturally ended — clear everything
            setNowPlayingTitle(null);
            setBroadcastingTitles(new Set());
            setIsChannelLive(false);
            setBroadcastStartedAt(0);
            setBroadcastMessage("Broadcast ended — all tracks finished");
          }
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [channelSlug, broadcastStartedAt]);

  async function endBroadcast() {
    setEndingBroadcast(true);
    setBroadcastMessage("");
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", broadcaster_id: broadcasterId }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastMessage("Broadcast ended");
        setIsChannelLive(false);
        setBroadcastingTitles(new Set());
        setNowPlayingTitle(null);
        setBroadcastStartedAt(0);
      } else {
        setBroadcastMessage(data.error || "Failed to stop broadcast");
      }
    } catch {
      setBroadcastMessage("Broadcast server unavailable");
    }
    setEndingBroadcast(false);
  }

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("tracks").update({ is_active: !current }).eq("id", id);
    loadTracks();
  }

  async function deleteTrack(id: string) {
    if (!confirm("Delete this track?")) return;
    await supabase.from("tracks").delete().eq("id", id);
    loadTracks();
  }

  function formatDuration(s: number | null) {
    if (!s) return "--:--";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  // Check if an ad can be inserted at the given position (1 ad per 15 songs rule)
  function canInsertAdAt(position: number, currentQueue: QueueItem[]): boolean {
    // Count tracks in the surrounding window
    let tracksBefore = 0;
    let tracksAfter = 0;

    // Look backward for the nearest ad (or start of queue)
    for (let i = position - 1; i >= 0; i--) {
      if (currentQueue[i].type === "advert") break;
      if (currentQueue[i].type === "track") tracksBefore++;
    }

    // Look forward for the nearest ad (or end of queue)
    for (let i = position; i < currentQueue.length; i++) {
      if (currentQueue[i].type === "advert") break;
      if (currentQueue[i].type === "track") tracksAfter++;
    }

    // The ad splits a window — both sides must have enough room
    // Total tracks in this window must be >= AD_WINDOW_SIZE for the ad to be valid
    // But we allow it as long as both neighbors aren't too close
    return tracksBefore + tracksAfter >= AD_WINDOW_SIZE ||
           (tracksBefore >= 1 && currentQueue.filter(q => q.type === "advert").length === 0);
  }

  function insertAdAtPosition(ad: ApprovedAd, position: number) {
    setQueue(prev => {
      // Check if this ad is already in the queue
      if (prev.some(q => q.type === "advert" && q.id === ad.id)) {
        setBroadcastMessage("This ad is already in the queue");
        return prev;
      }
      if (!canInsertAdAt(position, prev)) {
        setBroadcastMessage(`Max ${MAX_ADS_PER_WINDOW} ad per ${AD_WINDOW_SIZE} songs`);
        return prev;
      }
      const next = [...prev];
      next.splice(position, 0, { type: "advert", id: ad.id, data: ad });
      setBroadcastMessage("");
      return next;
    });
  }

  function removeAdFromQueue(adId: string) {
    setQueue(prev => prev.filter(q => !(q.type === "advert" && q.id === adId)));
  }

  // Get ads not yet placed in the queue
  const unplacedAds = approvedAds.filter(ad => !queue.some(q => q.type === "advert" && q.id === ad.id));

  // Persist track positions to Supabase after reorder
  async function saveTrackPositions(updatedQueue: QueueItem[]) {
    let pos = 0;
    const updates: { id: string; position: number }[] = [];
    for (const item of updatedQueue) {
      if (item.type === "track") {
        updates.push({ id: item.id, position: pos });
        pos++;
      }
    }
    // Batch update positions
    for (const u of updates) {
      await supabase.from("tracks").update({ position: u.position }).eq("id", u.id);
    }
  }

  function toggleTrackSelection(id: string) {
    setSelectedTracks((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setBroadcastMessage("");
  }

  function toggleSelectAll() {
    const selectableTracks = tracks.filter((t) =>
      t.is_active && !isTrackBroadcasting(t)
    );
    const allSelected = selectableTracks.length > 0 && selectableTracks.every((t) => selectedTracks.has(t.id));
    if (allSelected) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(selectableTracks.map((t) => t.id)));
    }
    setBroadcastMessage("");
  }

  function handleBroadcastClick() {
    if (selectedTracks.size === 0) {
      setBroadcastMessage("Select at least one track");
      return;
    }

    if (selectedTracks.size === 1 && !isChannelLive) {
      setBroadcastMessage("Tip: select 2+ tracks for continuous playback — 1 track will loop on repeat");
    }

    // Show agreement for new broadcasts, skip for adding tracks to existing
    if (!isChannelLive) {
      setShowAgreement(true);
    } else {
      executeBroadcast();
    }
  }

  async function executeBroadcast() {
    setShowAgreement(false);
    setBroadcasting(true);
    setBroadcastMessage("");

    // Build ordered queue for broadcast — only selected tracks + any ads in position
    const broadcastQueue = queue.filter(q =>
      q.type === "advert" || selectedTracks.has(q.id)
    ).map(q => ({ type: q.type, id: q.type === "track" ? q.id : (q.data as ApprovedAd).advert_id }));

    // Extract just track IDs for the server
    const trackIdsInOrder = broadcastQueue.filter(q => q.type === "track").map(q => q.id);

    // Mark selected tracks as active (ensure they're in the broadcast rotation)
    const { error } = await supabase
      .from("tracks")
      .update({ is_active: true })
      .in("id", trackIdsInOrder);

    if (error) {
      setBroadcastMessage(error.message);
      setBroadcasting(false);
      return;
    }

    // If already live, add tracks to running broadcast; otherwise start new
    const action = isChannelLive ? "add_tracks" : "start";
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          track_ids: trackIdsInOrder,
          broadcast_queue: broadcastQueue,
          broadcaster_id: broadcasterId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBroadcastMessage(data.error || `Failed to ${isChannelLive ? "add tracks" : "start broadcast"}`);
        setBroadcasting(false);
        return;
      }

      const count = selectedTracks.size;
      setBroadcastMessage(
        isChannelLive
          ? `${count} track${count > 1 ? "s" : ""} added to broadcast!`
          : `${count} track${count > 1 ? "s" : ""} broadcasting live!`
      );

      // Immediately mark selected tracks as broadcasting (don't wait for queue poll)
      const selectedTrackObjects = tracks.filter((t) => selectedTracks.has(t.id));
      setBroadcastingTitles((prev) => {
        const next = new Set(prev);
        for (const t of selectedTrackObjects) {
          next.add(normalize(`${t.primary_artist} - ${t.title}`));
          next.add(normalize(t.title));
        }
        return next;
      });

      setSelectedTracks(new Set());
      setIsChannelLive(true);
      setBroadcastStartedAt(Date.now());

      // Set channel slug so SSE connects for live indicators
      if (data.slug) {
        setChannelSlug(data.slug);
      }

      // Poll queue with retries — broadcast starts async so queue may not be ready yet
      const slug = data.slug || channelSlug;
      if (slug) {
        const pollQueue = async (retries: number) => {
          for (let i = 0; i < retries; i++) {
            await new Promise((r) => setTimeout(r, 3000)); // wait 3s between attempts
            try {
              const qRes = await fetch(`/api/channels/${slug}/queue`);
              if (qRes.ok) {
                const qData = await qRes.json();
                if (qData.queue && Array.isArray(qData.queue) && qData.queue.length > 0) {
                  const titles = new Set<string>();
                  for (const filename of qData.queue) {
                    const name = filename.replace(/\.[^.]+$/, "");
                    titles.add(normalize(name));
                  }
                  setBroadcastingTitles(titles);
                  return; // got queue, stop polling
                }
              }
            } catch { /* retry */ }
          }
        };
        pollQueue(20); // poll up to 20 times (60 seconds total)
      }

      loadTracks();
    } catch {
      setBroadcastMessage("Broadcast server unavailable — tracks queued but not live");
    }

    setBroadcasting(false);
  }

  // Strip special chars to match the filename sanitization in track-sync.ts
  function normalize(s: string) {
    return s.replace(/[^a-zA-Z0-9\s\-_.]/g, "").trim().toLowerCase();
  }

  function isTrackBroadcasting(t: Track) {
    if (broadcastingTitles.size === 0) return false;
    const key = normalize(`${t.primary_artist} - ${t.title}`);
    const titleNorm = normalize(t.title);
    return broadcastingTitles.has(key) ||
      Array.from(broadcastingTitles).some(bt => bt.includes(titleNorm) || titleNorm.includes(bt));
  }

  const selectableCount = tracks.filter((t) =>
    t.is_active && !isTrackBroadcasting(t)
  ).length;

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: "100vw",
      height: "100%",
      marginTop: "-24px",
      marginLeft: "calc(-50vw + 50%)",
      overflow: "hidden",
    }}>
      <style>{`
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cursor-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
        @keyframes broadcast-pulse {
          0%, 100% { box-shadow: 0 0 8px rgba(74, 222, 128, 0.3); }
          50% { box-shadow: 0 0 16px rgba(74, 222, 128, 0.6); }
        }
        .broadcast-glow {
          animation: broadcast-pulse 1.5s ease-in-out infinite;
        }
        @keyframes orange-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        .broadcasting-block {
          animation: orange-blink 1.2s ease-in-out infinite;
        }
        @keyframes active-pulse {
          0%, 100% { color: #4ADE80; border-color: rgba(74, 222, 128, 0.3); }
          50% { color: #86efac; border-color: rgba(74, 222, 128, 0.5); }
        }
        .active-status {
          animation: active-pulse 2s ease-in-out infinite;
        }
      `}</style>
      {/* ── Fixed top zone ── */}
      <div style={{ flexShrink: 0, padding: "24px 20px 0", backgroundColor: "var(--bg-base)" }}>
      <div style={{ marginBottom: "16px" }}>
        <div style={{ fontSize: "12px", letterSpacing: "0.05em", color: "#f59e0b", fontFamily: "var(--font-mono)", marginBottom: "4px" }}>
          {">"} track_list --all
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>
        <h1 style={{ fontSize: "24px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.05em" }}>Tracks<span style={{ color: "#f59e0b" }}>_</span></h1>
      </div>

      {/* Upload + Schedule row */}
      <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
        <a href="/broadcast/tracks/upload" style={{
          flex: 1,
          padding: "10px",
          backgroundColor: "#f59e0b",
          color: "#0a0a0a",
          borderRadius: "0px",
          fontSize: "11px",
          fontWeight: 700,
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontFamily: "var(--font-mono)",
          textAlign: "center",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Upload Track
        </a>
        <button
          type="button"
          onClick={() => {
            if (selectedTracks.size === 0) {
              setBroadcastMessage("Select tracks to schedule");
              return;
            }
            setShowSchedule(true);
          }}
          style={{
            flex: 1,
            padding: "10px",
            backgroundColor: "transparent",
            color: "#f59e0b",
            border: "1px solid #f59e0b",
            borderRadius: "0px",
            fontSize: "11px",
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "6px",
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          Schedule
        </button>
      </div>

      {/* Broadcast controls */}
      {tracks.length > 0 && (
        <>
          {broadcastMessage && (
            <p style={{
              fontSize: "11px",
              color: broadcastMessage.includes("Tip") ? "#f59e0b" : (broadcastMessage.includes("queued") || broadcastMessage.includes("broadcasting") || broadcastMessage.includes("ended") || broadcastMessage.includes("added")) ? "#4ADE80" : "#E24A4A",
              marginBottom: "12px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              {broadcastMessage}
            </p>
          )}

          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
            paddingBottom: "12px",
            borderBottom: "1px solid #27272a",
          }}>
            <button
              type="button"
              onClick={toggleSelectAll}
              disabled={selectableCount === 0}
              style={{
                background: "none",
                border: "1px solid #27272a",
                borderRadius: "0px",
                padding: "6px 12px",
                color: selectableCount === 0 ? "#3f3f46" : "#f59e0b",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                cursor: selectableCount === 0 ? "default" : "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {selectedTracks.size === selectableCount && selectableCount > 0 ? "DESELECT ALL" : "SELECT ALL"}
            </button>

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              {isChannelLive && (
                <button
                  type="button"
                  onClick={endBroadcast}
                  disabled={endingBroadcast}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "transparent",
                    color: "#E24A4A",
                    border: "1px solid #E24A4A",
                    borderRadius: "0px",
                    fontSize: "11px",
                    fontWeight: 700,
                    cursor: endingBroadcast ? "not-allowed" : "pointer",
                    opacity: endingBroadcast ? 0.6 : 1,
                    fontFamily: "var(--font-mono)",
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <rect x="4" y="4" width="16" height="16" />
                  </svg>
                  {endingBroadcast ? "STOPPING..." : "END"}
                </button>
              )}
              <button
                type="button"
                onClick={handleBroadcastClick}
                disabled={broadcasting}
                className={selectedTracks.size > 0 && !broadcasting ? "broadcast-glow" : ""}
                style={{
                  padding: "8px 20px",
                  backgroundColor: selectedTracks.size > 0
                    ? "#4ADE80"
                    : "rgba(24, 24, 27, 0.5)",
                  color: selectedTracks.size > 0
                    ? "#0a0a0a"
                    : "#52525b",
                  border: selectedTracks.size > 0
                    ? "1px solid #4ADE80"
                    : "1px solid #27272a",
                  borderRadius: "0px",
                  fontSize: "11px",
                  fontWeight: 700,
                  cursor: broadcasting ? "not-allowed" : "pointer",
                  opacity: broadcasting ? 0.6 : 1,
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                  <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
                  <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
                </svg>
                {broadcasting
                  ? (isChannelLive ? "ADDING..." : "BROADCASTING...")
                  : selectedTracks.size > 0
                    ? (isChannelLive ? `ADD TO BROADCAST (${selectedTracks.size})` : `BROADCAST (${selectedTracks.size})`)
                    : (isChannelLive ? "ADD TO BROADCAST" : "BROADCAST")
                }
              </button>
            </div>
          </div>

          {/* Scheduling message */}
          {schedulingMessage && (
            <p style={{
              fontSize: "11px",
              color: "#4ADE80",
              marginTop: "8px",
              fontFamily: "var(--font-mono)",
              letterSpacing: "0.05em",
              textTransform: "uppercase",
            }}>
              {schedulingMessage}
            </p>
          )}
        </>
      )}
      </div>{/* end fixed top zone */}

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>
      {loading ? (
        <InlineLoader />
      ) : tracks.length === 0 ? (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderRadius: "0px",
          borderLeft: "2px solid #27272a",
        }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "0.05em", fontSize: "12px" }}>No tracks uploaded yet</p>
          <a href="/broadcast/tracks/upload" style={{ color: "#f59e0b", textDecoration: "none", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Upload your first track
          </a>
        </div>
      ) : (
        <>
          {/* Available ads to place */}
          {unplacedAds.length > 0 && (
            <div style={{ marginBottom: "16px" }}>
              <div style={{
                fontSize: "11px", fontWeight: 700, color: "#4ADE80",
                letterSpacing: "0.1em", textTransform: "uppercase",
                marginBottom: "8px", fontFamily: "var(--font-mono)",
              }}>
                Available Ads — tap to place in queue
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {unplacedAds.map(ad => (
                  <button
                    key={ad.id}
                    type="button"
                    onClick={() => insertAdAtPosition(ad, 0)}
                    style={{
                      display: "flex", alignItems: "center", gap: "10px",
                      padding: "10px 12px",
                      backgroundColor: "rgba(74, 222, 128, 0.06)",
                      borderLeft: "3px solid #4ADE80",
                      border: "1px solid rgba(74, 222, 128, 0.2)",
                      borderRadius: "0px",
                      cursor: "pointer",
                      fontFamily: "var(--font-mono)",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="16" />
                      <line x1="8" y1="12" x2="16" y2="12" />
                    </svg>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "12px", fontWeight: 600, color: "#4ADE80", textTransform: "uppercase" }}>
                        {ad.title}
                      </div>
                      <div style={{ fontSize: "10px", color: "#71717a" }}>
                        by {ad.advertiser_name} {ad.duration_seconds ? `· ${Math.round(ad.duration_seconds)}s` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: "9px", color: "#4ADE80", letterSpacing: "0.1em" }}>+ ADD</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DraggableQueueList
            queue={queue}
            setQueue={setQueue}
            selectedTracks={selectedTracks}
            nowPlayingTitle={nowPlayingTitle}
            normalize={normalize}
            isTrackBroadcasting={isTrackBroadcasting}
            toggleTrackSelection={toggleTrackSelection}
            toggleActive={toggleActive}
            deleteTrack={deleteTrack}
            removeAdFromQueue={removeAdFromQueue}
            formatDuration={formatDuration}
            onReorder={saveTrackPositions}
          />
        </>
      )}

      </div>{/* end scrollable zone */}

      {/* Broadcast Agreement Modal */}
      {showAgreement && (
        <BroadcastAgreement
          trackCount={selectedTracks.size}
          onAccept={executeBroadcast}
          onCancel={() => setShowAgreement(false)}
        />
      )}

      {/* Schedule Modal */}
      {showSchedule && (
        <ScheduleModal
          trackCount={selectedTracks.size}
          onSchedule={handleSchedule}
          onCancel={() => setShowSchedule(false)}
        />
      )}
    </div>
  );
}

function DraggableQueueList({
  queue, setQueue, selectedTracks, nowPlayingTitle, normalize,
  isTrackBroadcasting, toggleTrackSelection, toggleActive, deleteTrack, removeAdFromQueue, formatDuration, onReorder,
}: {
  queue: QueueItem[];
  setQueue: (q: QueueItem[] | ((prev: QueueItem[]) => QueueItem[])) => void;
  selectedTracks: Set<string>;
  nowPlayingTitle: string | null;
  normalize: (s: string) => string;
  isTrackBroadcasting: (t: Track) => boolean;
  toggleTrackSelection: (id: string) => void;
  toggleActive: (id: string, current: boolean) => void;
  deleteTrack: (id: string) => void;
  removeAdFromQueue: (id: string) => void;
  formatDuration: (s: number | null) => string;
  onReorder: (q: QueueItem[]) => void;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startY = useRef(0);
  const listRef = useRef<HTMLDivElement>(null);
  const itemRects = useRef<DOMRect[]>([]);
  const scrollParent = useRef<HTMLElement | null>(null);

  function captureRects() {
    if (!listRef.current) return;
    const items = Array.from(listRef.current.children) as HTMLElement[];
    itemRects.current = items.map((el) => el.getBoundingClientRect());
    let parent = listRef.current.parentElement;
    while (parent) {
      const style = getComputedStyle(parent);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        scrollParent.current = parent;
        break;
      }
      parent = parent.parentElement;
    }
  }

  function getOverIndex(clientY: number): number {
    for (let i = 0; i < itemRects.current.length; i++) {
      const rect = itemRects.current[i];
      const midY = rect.top + rect.height / 2;
      if (clientY < midY) return i;
    }
    return itemRects.current.length - 1;
  }

  function startDrag(index: number, clientY: number) {
    captureRects();
    setDragIndex(index);
    setOverIndex(index);
    setDragOffset(0);
    setIsDragging(true);
    startY.current = clientY;
    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";
  }

  function moveDrag(clientY: number) {
    if (dragIndex === null) return;
    const offset = clientY - startY.current;
    setDragOffset(offset);
    const newOver = getOverIndex(clientY);
    if (newOver !== overIndex) setOverIndex(newOver);
    if (scrollParent.current) {
      const sp = scrollParent.current;
      const spRect = sp.getBoundingClientRect();
      const edgeZone = 60;
      if (clientY < spRect.top + edgeZone) sp.scrollTop -= 8;
      else if (clientY > spRect.bottom - edgeZone) sp.scrollTop += 8;
    }
  }

  function endDrag() {
    if (dragIndex !== null && overIndex !== null && dragIndex !== overIndex) {
      setQueue(prev => {
        const next = [...prev];
        const [moved] = next.splice(dragIndex, 1);
        next.splice(overIndex, 0, moved);
        // Persist new positions to DB
        onReorder(next);
        return next;
      });
    }
    setDragIndex(null);
    setOverIndex(null);
    setDragOffset(0);
    setIsDragging(false);
    draggingRef.current = false;
    document.body.style.overflow = "";
    document.body.style.touchAction = "";
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  const draggingRef = useRef(false);
  const longPressTimerRef2 = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    function handleTouchMove(e: TouchEvent) {
      if (longPressTimerRef2.current && !draggingRef.current) {
        // Cancel long press if finger moved beyond threshold (user is scrolling, not dragging)
        const dx = e.touches[0].clientX - touchStartPos.current.x;
        const dy = e.touches[0].clientY - touchStartPos.current.y;
        if (Math.abs(dx) > MOVE_THRESHOLD || Math.abs(dy) > MOVE_THRESHOLD) {
          clearTimeout(longPressTimerRef2.current);
          longPressTimerRef2.current = null;
        }
        return;
      }
      if (!draggingRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      moveDrag(e.touches[0].clientY);
    }
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => el.removeEventListener("touchmove", handleTouchMove);
  });

  const touchStartPos = useRef({ x: 0, y: 0 });
  const MOVE_THRESHOLD = 10; // px — cancel long press if finger moves more than this

  function onTouchStart(e: React.TouchEvent, index: number) {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    longPressTimerRef2.current = setTimeout(() => {
      draggingRef.current = true;
      startDrag(index, touch.clientY);
    }, 400);
  }

  function onTouchEnd() {
    if (longPressTimerRef2.current) {
      clearTimeout(longPressTimerRef2.current);
      longPressTimerRef2.current = null;
    }
    if (isDragging) endDrag();
  }

  function onMouseDown(e: React.MouseEvent, index: number) {
    const target = e.target as HTMLElement;
    if (!target.closest("[data-drag-handle]")) return;
    e.preventDefault();
    startDrag(index, e.clientY);
    const onMove = (ev: MouseEvent) => moveDrag(ev.clientY);
    const onUp = () => {
      endDrag();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  const itemH = itemRects.current[0]?.height || 88;
  const gap = 8;
  const step = itemH + gap;

  return (
    <div ref={listRef} style={{ display: "flex", flexDirection: "column", gap: `${gap}px`, position: "relative" }}>
      {queue.map((item, index) => {
        const isBeingDragged = isDragging && index === dragIndex;
        let slideY = 0;
        if (isDragging && dragIndex !== null && overIndex !== null && index !== dragIndex) {
          if (dragIndex < overIndex) {
            if (index > dragIndex && index <= overIndex) slideY = -step;
          } else if (dragIndex > overIndex) {
            if (index >= overIndex && index < dragIndex) slideY = step;
          }
        }

        return (
          <div
            key={`${item.type}-${item.id}`}
            style={{
              position: "relative",
              zIndex: isBeingDragged ? 100 : 1,
              transform: isBeingDragged
                ? `translateY(${dragOffset}px) scale(1.02)`
                : `translateY(${slideY}px)`,
              transition: isBeingDragged
                ? "box-shadow 0.2s, scale 0.2s"
                : "transform 0.25s cubic-bezier(0.25, 1, 0.5, 1)",
              opacity: isBeingDragged ? 0.9 : 1,
              boxShadow: isBeingDragged
                ? item.type === "advert"
                  ? "0 8px 32px rgba(74, 222, 128, 0.3)"
                  : "0 8px 32px rgba(245, 158, 11, 0.3)"
                : "none",
              touchAction: isDragging ? "none" : "auto",
            }}
            onTouchStart={(e) => onTouchStart(e, index)}
            onTouchEnd={onTouchEnd}
            onMouseDown={(e) => onMouseDown(e, index)}
          >
            {item.type === "track" ? (
              <TrackCard
                track={item.data as Track}
                isSelected={selectedTracks.has(item.id)}
                isNowPlaying={nowPlayingTitle !== null && normalize(nowPlayingTitle).includes(normalize((item.data as Track).title))}
                isBroadcasting={isTrackBroadcasting(item.data as Track)}
                onToggleSelection={() => !isDragging && toggleTrackSelection(item.id)}
                onToggleActive={() => toggleActive(item.id, (item.data as Track).is_active)}
                onDelete={() => deleteTrack(item.id)}
                formatDuration={formatDuration}
                showDragHandle
              />
            ) : (
              <AdCard
                ad={item.data as ApprovedAd}
                onRemove={() => removeAdFromQueue(item.id)}
                formatDuration={formatDuration}
                showDragHandle
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function TrackCard({ track, isSelected, isNowPlaying, isBroadcasting, onToggleSelection, onToggleActive, onDelete, formatDuration, showDragHandle }: {
  track: Track;
  isSelected: boolean;
  isNowPlaying: boolean;
  isBroadcasting: boolean;
  onToggleSelection: () => void;
  onToggleActive: () => void;
  onDelete: () => void;
  formatDuration: (s: number | null) => string;
  showDragHandle?: boolean;
}) {
  const isSelectable = track.is_active && !isBroadcasting;
  const dominantColor = useDominantColor(track.artwork_url);
  const hasArt = !!track.artwork_url;

  return (
    <div
      onClick={() => isSelectable && onToggleSelection()}
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        gap: "12px",
        padding: "12px",
        backgroundColor: hasArt && dominantColor
          ? dominantColor
          : isNowPlaying
            ? "rgba(245, 158, 11, 0.06)"
            : isSelected
              ? "rgba(74, 222, 128, 0.05)"
              : "rgba(24, 24, 27, 0.3)",
        borderLeft: isNowPlaying
          ? "3px solid #f59e0b"
          : isSelected
            ? "3px solid #4ADE80"
            : "2px solid #27272a",
        borderRadius: "0px",
        opacity: track.is_active ? 1 : 0.4,
        cursor: isSelectable ? "pointer" : "default",
        transition: "background-color 0.15s, border-color 0.15s",
        overflow: "hidden",
        minHeight: hasArt ? "80px" : undefined,
      }}
    >
      {/* Artwork centered background */}
      {hasArt && (
        <>
          {/* Dark overlay for text readability */}
          <div style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.55)",
            zIndex: 1,
          }} />
          {/* Centered artwork */}
          <div style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            width: "64px",
            height: "64px",
            zIndex: 0,
          }}>
            <img
              src={track.artwork_url!}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "4px",
                boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
              }}
            />
          </div>
        </>
      )}

      {/* Drag handle */}
      {showDragHandle && (
        <div
          data-drag-handle
          style={{
            zIndex: 2,
            cursor: "grab",
            padding: "4px 2px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flexShrink: 0,
            touchAction: "none",
          }}
        >
          <div style={{ width: "12px", height: "2px", backgroundColor: hasArt ? "rgba(255,255,255,0.4)" : "#52525b", borderRadius: "1px" }} />
          <div style={{ width: "12px", height: "2px", backgroundColor: hasArt ? "rgba(255,255,255,0.4)" : "#52525b", borderRadius: "1px" }} />
          <div style={{ width: "12px", height: "2px", backgroundColor: hasArt ? "rgba(255,255,255,0.4)" : "#52525b", borderRadius: "1px" }} />
        </div>
      )}

      {/* Checkbox / On-Air indicator */}
      <div style={{ zIndex: 2 }}>
        {isBroadcasting ? (
          <div style={{
            width: "14px",
            height: "14px",
            backgroundColor: "#f59e0b",
            flexShrink: 0,
            animation: "orange-blink 1.2s ease-in-out infinite",
          }} />
        ) : !track.is_active ? null : (
          <div style={{
            width: "18px",
            height: "18px",
            border: isSelected
              ? "2px solid #4ADE80"
              : "2px solid rgba(255,255,255,0.3)",
            backgroundColor: isSelected ? "#4ADE80" : "transparent",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            transition: "all 0.15s",
          }}>
            {isSelected && (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        )}
      </div>

      {/* Track info */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden", zIndex: 2 }}>
        <div style={{
          fontWeight: 600,
          fontSize: "14px",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
          color: isNowPlaying ? "#fbbf24" : hasArt ? "#fff" : undefined,
          textShadow: hasArt ? "0 1px 3px rgba(0,0,0,0.5)" : undefined,
        }}>
          {track.title}
        </div>
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginTop: "2px",
        }}>
          <span style={{
            color: isNowPlaying ? "#f59e0b" : hasArt ? "rgba(255,255,255,0.7)" : "var(--text-secondary)",
            fontSize: "12px",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
            minWidth: 0,
            textShadow: hasArt ? "0 1px 2px rgba(0,0,0,0.5)" : undefined,
          }}>
            {isNowPlaying && (
              <span style={{ fontSize: "10px", letterSpacing: "0.1em", marginRight: "6px" }}>
                ON AIR
              </span>
            )}
            {track.primary_artist}
            {track.featured_artists?.length ? ` ft. ${track.featured_artists.join(", ")}` : ""}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: hasArt ? "rgba(255,255,255,0.5)" : "var(--text-tertiary)",
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}>
            {formatDuration(track.duration_seconds)}
          </span>
        </div>
        {track.genre?.length ? (
          <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
            {track.genre.slice(0, 2).map((g) => (
              <span key={g} style={{
                fontSize: "9px",
                padding: "1px 6px",
                backgroundColor: hasArt ? "rgba(0,0,0,0.4)" : "var(--bg-well)",
                borderRadius: "0px",
                border: hasArt ? "1px solid rgba(255,255,255,0.15)" : "1px solid #27272a",
                color: hasArt ? "rgba(255,255,255,0.7)" : "var(--text-secondary)",
                fontFamily: "var(--font-mono)",
              }}>{g}</span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Right side: Status + Delete */}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0, zIndex: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); if (!isBroadcasting) onToggleActive(); }}
          style={{
            background: "none",
            border: hasArt ? "1px solid rgba(255,255,255,0.2)" : "1px solid var(--border-subtle)",
            color: isBroadcasting ? "#4ADE80" : track.is_active ? "#f59e0b" : hasArt ? "rgba(255,255,255,0.4)" : "var(--text-tertiary)",
            padding: "3px 8px",
            borderRadius: "0px",
            fontSize: "10px",
            cursor: isBroadcasting ? "default" : "pointer",
            fontFamily: "var(--font-mono)",
            animation: isBroadcasting ? "active-pulse 2s ease-in-out infinite" : "none",
            whiteSpace: "nowrap",
          }}
        >
          {isBroadcasting ? "ACTIVE" : track.is_active ? "READY" : "OFF"}
        </button>
        <TrashButton onClick={() => { onDelete(); }} />
      </div>
    </div>
  );
}

function AdCard({ ad, onRemove, formatDuration, showDragHandle }: {
  ad: ApprovedAd;
  onRemove: () => void;
  formatDuration: (s: number | null) => string;
  showDragHandle?: boolean;
}) {
  return (
    <div style={{
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: "12px",
      padding: "12px",
      backgroundColor: "rgba(74, 222, 128, 0.06)",
      borderLeft: "3px solid #4ADE80",
      borderRadius: "0px",
      cursor: "default",
      transition: "background-color 0.15s",
    }}>
      {/* Drag handle */}
      {showDragHandle && (
        <div
          data-drag-handle
          style={{
            cursor: "grab",
            padding: "4px 2px",
            display: "flex",
            flexDirection: "column",
            gap: "2px",
            flexShrink: 0,
            touchAction: "none",
          }}
        >
          <div style={{ width: "12px", height: "2px", backgroundColor: "rgba(74, 222, 128, 0.4)", borderRadius: "1px" }} />
          <div style={{ width: "12px", height: "2px", backgroundColor: "rgba(74, 222, 128, 0.4)", borderRadius: "1px" }} />
          <div style={{ width: "12px", height: "2px", backgroundColor: "rgba(74, 222, 128, 0.4)", borderRadius: "1px" }} />
        </div>
      )}

      {/* Ad icon */}
      <div style={{
        width: "32px", height: "32px",
        display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "rgba(74, 222, 128, 0.12)",
        border: "1px solid rgba(74, 222, 128, 0.25)",
        borderRadius: "4px",
        flexShrink: 0,
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
        </svg>
      </div>

      {/* Ad info */}
      <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
        <div style={{
          display: "flex", alignItems: "center", gap: "6px",
        }}>
          <span style={{
            fontSize: "9px", fontWeight: 700,
            color: "#0a0a0a", backgroundColor: "#4ADE80",
            padding: "1px 6px", letterSpacing: "0.1em",
            fontFamily: "var(--font-mono)",
          }}>AD</span>
          <span style={{
            fontWeight: 600, fontSize: "14px",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            textTransform: "uppercase", color: "#4ADE80",
          }}>
            {ad.title}
          </span>
        </div>
        <div style={{
          display: "flex", alignItems: "center", gap: "8px", marginTop: "2px",
        }}>
          <span style={{ color: "#71717a", fontSize: "12px" }}>
            {ad.advertiser_name}
          </span>
          <span style={{
            fontFamily: "var(--font-mono)", fontSize: "11px",
            color: "rgba(74, 222, 128, 0.5)", whiteSpace: "nowrap",
          }}>
            {formatDuration(ad.duration_seconds)}
          </span>
        </div>
      </div>

      {/* Remove button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        style={{
          background: "none",
          border: "1px solid rgba(74, 222, 128, 0.2)",
          color: "#E24A4A",
          padding: "3px 8px",
          borderRadius: "0px",
          fontSize: "10px",
          cursor: "pointer",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
          flexShrink: 0,
        }}
      >
        REMOVE
      </button>
    </div>
  );
}

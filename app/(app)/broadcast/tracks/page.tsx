"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import TrashButton from "@/app/components/TrashButton";
import BroadcastAgreement from "@/app/components/BroadcastAgreement";
import InlineLoader from "@/app/components/InlineLoader";

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
}

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

  async function loadTracks() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("tracks")
      .select("id, title, primary_artist, featured_artists, producer, genre, duration_seconds, is_active, uploaded_at")
      .eq("broadcaster_id", user.id)
      .order("uploaded_at", { ascending: false });

    setTracks(data || []);
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
          setNowPlayingTitle(null);
          setBroadcastingTitles(new Set());
          setIsChannelLive(false);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [channelSlug]);

  async function endBroadcast() {
    setEndingBroadcast(true);
    setBroadcastMessage("");
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop" }),
      });
      const data = await res.json();
      if (res.ok) {
        setBroadcastMessage("Broadcast ended");
        setIsChannelLive(false);
        setBroadcastingTitles(new Set());
        setNowPlayingTitle(null);
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

    // Mark selected tracks as active (ensure they're in the broadcast rotation)
    const { error } = await supabase
      .from("tracks")
      .update({ is_active: true })
      .in("id", Array.from(selectedTracks));

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
        body: JSON.stringify({ action, track_ids: Array.from(selectedTracks) }),
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
      setSelectedTracks(new Set());
      setIsChannelLive(true);

      // Set channel slug so SSE connects for live indicators
      if (data.slug) {
        setChannelSlug(data.slug);
      }

      // Re-fetch queue to update broadcasting indicators
      if (channelSlug) {
        try {
          const qRes = await fetch(`/api/channels/${channelSlug}/queue`);
          if (qRes.ok) {
            const qData = await qRes.json();
            if (qData.queue && Array.isArray(qData.queue)) {
              const titles = new Set<string>();
              for (const filename of qData.queue) {
                const name = filename.replace(/\.[^.]+$/, "");
                titles.add(normalize(name));
              }
              setBroadcastingTitles(titles);
            }
          }
        } catch { /* ignore */ }
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
      height: "calc(100dvh - 65px)",
      marginTop: "-24px",
      marginLeft: "-20px",
      marginRight: "-20px",
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <div>
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
        <a href="/broadcast/tracks/upload" style={{
          padding: "10px 20px",
          backgroundColor: "#f59e0b",
          color: "#0a0a0a",
          borderRadius: "0px",
          fontSize: "11px",
          fontWeight: 700,
          textDecoration: "none",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>Upload Track</a>
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
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {tracks.map((track) => {
            const isSelected = selectedTracks.has(track.id);
            const isNowPlaying = nowPlayingTitle !== null &&
              normalize(nowPlayingTitle).includes(normalize(track.title));
            const isBroadcasting = isTrackBroadcasting(track);
            const isSelectable = track.is_active && !isBroadcasting;

            return (
              <div
                key={track.id}
                onClick={() => isSelectable && toggleTrackSelection(track.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  padding: "16px",
                  backgroundColor: isNowPlaying
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
                }}
              >
                {/* Checkbox / On-Air indicator */}
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
                      : "2px solid #3f3f46",
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

                {/* Track info — two-row layout for mobile */}
                <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
                  {/* Row 1: Title */}
                  <div style={{
                    fontWeight: 600,
                    fontSize: "14px",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    textTransform: "uppercase",
                    color: isNowPlaying ? "#fbbf24" : undefined,
                  }}>
                    {track.title}
                  </div>
                  {/* Row 2: Artist + duration */}
                  <div style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginTop: "2px",
                  }}>
                    <span style={{
                      color: isNowPlaying ? "#f59e0b" : "var(--text-secondary)",
                      fontSize: "12px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      flex: 1,
                      minWidth: 0,
                    }}>
                      {isNowPlaying && (
                        <span style={{
                          fontSize: "10px",
                          letterSpacing: "0.1em",
                          marginRight: "6px",
                        }}>
                          ON AIR
                        </span>
                      )}
                      {track.primary_artist}
                      {track.featured_artists?.length ? ` ft. ${track.featured_artists.join(", ")}` : ""}
                    </span>
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "11px",
                      color: "var(--text-tertiary)",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}>
                      {formatDuration(track.duration_seconds)}
                    </span>
                  </div>
                  {/* Row 3: Genre tags */}
                  {track.genre?.length ? (
                    <div style={{ display: "flex", gap: "4px", marginTop: "6px", flexWrap: "wrap" }}>
                      {track.genre.slice(0, 2).map((g) => (
                        <span key={g} style={{
                          fontSize: "9px",
                          padding: "1px 6px",
                          backgroundColor: "var(--bg-well)",
                          borderRadius: "0px",
                          border: "1px solid #27272a",
                          color: "var(--text-secondary)",
                          fontFamily: "var(--font-mono)",
                        }}>{g}</span>
                      ))}
                    </div>
                  ) : null}
                </div>

                {/* Right side: Status + Delete stacked */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px", flexShrink: 0 }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); if (!isBroadcasting) toggleActive(track.id, track.is_active); }}
                    style={{
                      background: "none",
                      border: "1px solid var(--border-subtle)",
                      color: isBroadcasting ? "#4ADE80" : track.is_active ? "#f59e0b" : "var(--text-tertiary)",
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
                  <TrashButton onClick={() => deleteTrack(track.id)} />
                </div>
              </div>
            );
          })}
        </div>
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
    </div>
  );
}

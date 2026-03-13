"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

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

    // Get channel slug for SSE connection
    if (!channelSlug) {
      const { data: ch } = await supabase
        .from("broadcaster_profiles")
        .select("channel_slug, is_live")
        .eq("id", user.id)
        .single();
      if (ch?.channel_slug && ch.is_live) setChannelSlug(ch.channel_slug);
    }
  }

  useEffect(() => { loadTracks(); }, []);

  // SSE: track currently broadcasting
  useEffect(() => {
    if (!channelSlug) return;
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const url = `http://${host}:8001/channels/${channelSlug}/now-playing`;
    const es = new EventSource(url);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.track && !data.ended) {
          setNowPlayingTitle(data.track.title);
          const titles = new Set<string>();
          titles.add(data.track.title.toLowerCase());
          setBroadcastingTitles(titles);
        } else {
          setNowPlayingTitle(null);
          setBroadcastingTitles(new Set());
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [channelSlug]);

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
      t.is_active && !broadcastingTitles.has(t.title.toLowerCase())
    );
    const allSelected = selectableTracks.length > 0 && selectableTracks.every((t) => selectedTracks.has(t.id));
    if (allSelected) {
      setSelectedTracks(new Set());
    } else {
      setSelectedTracks(new Set(selectableTracks.map((t) => t.id)));
    }
    setBroadcastMessage("");
  }

  async function handleBroadcast() {
    if (selectedTracks.size === 0) {
      setBroadcastMessage("Select at least one track");
      return;
    }

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

    // Start the broadcast immediately
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setBroadcastMessage(data.error || "Failed to start broadcast");
        setBroadcasting(false);
        return;
      }

      setBroadcastMessage(`${selectedTracks.size} track${selectedTracks.size > 1 ? "s" : ""} broadcasting live!`);
      setSelectedTracks(new Set());

      // Set channel slug so SSE connects for live indicators
      if (data.slug) {
        setChannelSlug(data.slug);
      }

      loadTracks();
    } catch {
      setBroadcastMessage("Broadcast server unavailable — tracks queued but not live");
    }

    setBroadcasting(false);
  }

  const selectableCount = tracks.filter((t) =>
    t.is_active && !broadcastingTitles.has(t.title.toLowerCase())
  ).length;

  return (
    <div>
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
      `}</style>
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
          <h1 style={{ fontSize: "24px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.05em" }}>Tracks</h1>
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
              color: (broadcastMessage.includes("queued") || broadcastMessage.includes("broadcasting")) ? "#4ADE80" : "#E24A4A",
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
                color: selectableCount === 0 ? "#3f3f46" : "#a1a1aa",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                cursor: selectableCount === 0 ? "default" : "pointer",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}
            >
              {selectedTracks.size === selectableCount && selectableCount > 0 ? "DESELECT ALL" : "SELECT ALL"}
            </button>

            <button
              type="button"
              onClick={handleBroadcast}
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
                ? "BROADCASTING..."
                : selectedTracks.size > 0
                  ? `BROADCAST (${selectedTracks.size})`
                  : "BROADCAST"
              }
            </button>
          </div>
        </>
      )}

      {loading ? (
        <p style={{ color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", fontSize: "12px" }}>Loading...</p>
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
              track.title.toLowerCase() === nowPlayingTitle.toLowerCase();
            const isBroadcasting = broadcastingTitles.has(track.title.toLowerCase());
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
                  <div className="cursor-blink" style={{
                    width: "18px",
                    height: "18px",
                    border: "2px solid #f59e0b",
                    backgroundColor: isNowPlaying ? "#f59e0b" : "rgba(245, 158, 11, 0.15)",
                    boxShadow: "0 0 8px rgba(245, 158, 11, 0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
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

                {/* Track info */}
                <div style={{ flex: 1, minWidth: 0 }}>
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
                  <div style={{ color: isNowPlaying ? "#f59e0b" : "var(--text-secondary)", fontSize: "13px" }}>
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
                  </div>
                </div>

                {/* Duration */}
                <div style={{ fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-tertiary)", whiteSpace: "nowrap" }}>
                  {formatDuration(track.duration_seconds)}
                </div>

                {/* Genre tags — hidden on small screens to save space */}
                {track.genre?.length ? (
                  <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                    {track.genre.slice(0, 2).map((g) => (
                      <span key={g} style={{
                        fontSize: "10px",
                        padding: "2px 8px",
                        backgroundColor: "var(--bg-well)",
                        borderRadius: "0px",
                        border: "1px solid #27272a",
                        color: "var(--text-secondary)",
                        fontFamily: "var(--font-mono)",
                      }}>{g}</span>
                    ))}
                  </div>
                ) : null}

                {/* Status toggle */}
                <button onClick={(e) => { e.stopPropagation(); toggleActive(track.id, track.is_active); }} style={{
                  background: "none",
                  border: "1px solid var(--border-subtle)",
                  color: isBroadcasting ? "#4ADE80" : track.is_active ? "#f59e0b" : "var(--text-tertiary)",
                  padding: "4px 10px",
                  borderRadius: "0px",
                  fontSize: "11px",
                  cursor: "pointer",
                  fontFamily: "var(--font-mono)",
                }}>
                  {isBroadcasting ? "ACTIVE" : track.is_active ? "READY" : "INACTIVE"}
                </button>

                {/* Delete */}
                <button onClick={(e) => { e.stopPropagation(); deleteTrack(track.id); }} style={{
                  background: "none",
                  border: "none",
                  color: "#52525b",
                  cursor: "pointer",
                  fontSize: "16px",
                  padding: "4px",
                }}>{"\u00D7"}</button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

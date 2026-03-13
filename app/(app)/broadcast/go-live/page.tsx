"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function GoLivePage() {
  const supabase = createClient();
  const [isLive, setIsLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [message, setMessage] = useState("");
  const [channelName, setChannelName] = useState("");
  const [channelSlug, setChannelSlug] = useState("");
  const [trackCount, setTrackCount] = useState(0);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: channel } = await supabase
        .from("broadcaster_profiles")
        .select("channel_name, channel_slug, is_live")
        .eq("id", user.id)
        .single();

      if (channel) {
        setChannelName(channel.channel_name);
        setChannelSlug(channel.channel_slug);
        setIsLive(channel.is_live);
      }

      const { count } = await supabase
        .from("tracks")
        .select("*", { count: "exact", head: true })
        .eq("broadcaster_id", user.id)
        .eq("is_active", true);

      setTrackCount(count ?? 0);
      setLoading(false);
    }
    load();
  }, []);

  // SSE for now playing when live
  useEffect(() => {
    if (!isLive || !channelSlug) return;
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const es = new EventSource(`http://${host}:8001/channels/${channelSlug}/now-playing`);
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.track && !data.ended) {
          setNowPlaying(data.track.title);
        } else {
          setNowPlaying(null);
        }
      } catch { /* ignore */ }
    };
    return () => es.close();
  }, [isLive, channelSlug]);

  async function toggleBroadcast() {
    setToggling(true);
    setMessage("");

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: isLive ? "stop" : "start" }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Failed");
        setToggling(false);
        return;
      }

      setIsLive(!isLive);
      setMessage(isLive ? "Channel is now offline" : "Channel is now live!");
      if (isLive) setNowPlaying(null);
    } catch {
      setMessage("Broadcast server unavailable");
    }

    setToggling(false);
  }

  if (loading) {
    return (
      <div style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em", padding: "40px 0" }}>
        Loading...
      </div>
    );
  }

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
        @keyframes live-pulse {
          0%, 100% { box-shadow: 0 0 20px rgba(245, 158, 11, 0.3); }
          50% { box-shadow: 0 0 40px rgba(245, 158, 11, 0.6), 0 0 60px rgba(245, 158, 11, 0.2); }
        }
        .live-glow {
          animation: live-pulse 2s ease-in-out infinite;
        }
      `}</style>

      {/* Terminal header */}
      <div style={{ marginBottom: "8px" }}>
        <span style={{ color: "#f59e0b", fontSize: "13px" }}>{"> "}broadcast --go-live</span>
        <span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>

      <h1 style={{
        fontSize: "28px",
        fontWeight: 700,
        letterSpacing: "-0.05em",
        textTransform: "uppercase",
        marginBottom: "8px",
      }}>
        Go Live
      </h1>
      <p style={{
        color: "#52525b",
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "32px",
      }}>
        /{channelSlug} — {channelName}
      </p>

      {/* Status card */}
      <div className={isLive ? "live-glow" : ""} style={{
        padding: "32px 24px",
        backgroundColor: isLive ? "rgba(245, 158, 11, 0.06)" : "rgba(24, 24, 27, 0.3)",
        borderLeft: isLive ? "4px solid #f59e0b" : "2px solid #27272a",
        marginBottom: "24px",
        textAlign: "center",
      }}>
        {/* Live indicator */}
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "16px",
        }}>
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: isLive ? "#f59e0b" : "#3f3f46",
            boxShadow: isLive ? "0 0 8px rgba(245, 158, 11, 0.8)" : "none",
          }} />
          <span style={{
            fontSize: "18px",
            fontWeight: 700,
            color: isLive ? "#f59e0b" : "#52525b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            {isLive ? "ON AIR" : "OFFLINE"}
          </span>
        </div>

        {/* Now playing */}
        {isLive && nowPlaying && (
          <div style={{
            fontSize: "12px",
            color: "#fbbf24",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "16px",
          }}>
            NOW PLAYING: {nowPlaying}
          </div>
        )}

        {/* Track count */}
        <div style={{
          fontSize: "11px",
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          {trackCount} active track{trackCount !== 1 ? "s" : ""} ready
        </div>
      </div>

      {/* Message */}
      {message && (
        <p style={{
          fontSize: "11px",
          color: message.includes("live") ? "#4ADE80" : message.includes("offline") ? "#f59e0b" : "#E24A4A",
          marginBottom: "16px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>
          {message}
        </p>
      )}

      {/* Go Live / Stop button */}
      <button
        onClick={toggleBroadcast}
        disabled={toggling || (!isLive && trackCount === 0)}
        style={{
          width: "100%",
          padding: "16px",
          backgroundColor: isLive ? "transparent" : "#f59e0b",
          color: isLive ? "#E24A4A" : "#0a0a0a",
          border: isLive ? "2px solid #E24A4A" : "none",
          fontSize: "13px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          cursor: toggling || (!isLive && trackCount === 0) ? "not-allowed" : "pointer",
          opacity: toggling ? 0.6 : 1,
          fontFamily: "'JetBrains Mono', monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
        }}
      >
        {isLive ? (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none">
              <rect x="4" y="4" width="16" height="16" />
            </svg>
            {toggling ? "STOPPING..." : "STOP BROADCAST"}
          </>
        ) : (
          <>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
              <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
              <circle cx="12" cy="12" r="2" fill="currentColor" />
              <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
              <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
            </svg>
            {toggling ? "STARTING..." : "GO LIVE"}
          </>
        )}
      </button>

      {!isLive && trackCount === 0 && (
        <p style={{
          fontSize: "11px",
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginTop: "12px",
          textAlign: "center",
        }}>
          Upload and activate tracks before going live
        </p>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface Track {
  id: string;
  title: string;
  primary_artist: string;
  file_url: string;
  duration_seconds: number | null;
  is_active: boolean;
}

interface ApprovedAd {
  id: string;
  frequency: string;
  advert: { title: string; file_url: string | null; duration_seconds: number | null };
  advertiser: { display_name: string };
}

type Panel = "none" | "music" | "ads";

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
  const [nowPlayingArtist, setNowPlayingArtist] = useState<string | null>(null);
  const [nowPlayingType, setNowPlayingType] = useState<string>("track");
  const [trackDuration, setTrackDuration] = useState(0);
  const [trackElapsed, setTrackElapsed] = useState(0);
  const trackStartTimeRef = useRef<number>(0);

  // Panels
  const [activePanel, setActivePanel] = useState<Panel>("none");

  // Music library
  const [tracks, setTracks] = useState<Track[]>([]);
  const [tracksLoading, setTracksLoading] = useState(false);
  const [selectedTrackIds, setSelectedTrackIds] = useState<Set<string>>(new Set());

  // Ads
  const [approvedAds, setApprovedAds] = useState<ApprovedAd[]>([]);
  const [adsLoading, setAdsLoading] = useState(false);

  // Cue system
  const [cuedFilename, setCuedFilename] = useState<string | null>(null);
  const [skipping, setSkipping] = useState(false);

  // Live queue filenames (tracks currently in broadcast rotation)
  const [liveQueueFilenames, setLiveQueueFilenames] = useState<Set<string>>(new Set());

  // Live listener count
  const [liveListeners, setLiveListeners] = useState(0);

  // AI Host
  const [aiHostEnabled, setAiHostEnabled] = useState(false);
  const [aiHostAvailable, setAiHostAvailable] = useState(false);
  const [subscribedAgents, setSubscribedAgents] = useState<{ name: string; role: string }[]>([]);

  // Volume controls
  const [musicVolume, setMusicVolume] = useState(80);
  const [micVolume, setMicVolume] = useState(100);
  const [micActive, setMicActive] = useState(false);
  const [micStream, setMicStream] = useState<MediaStream | null>(null);

  // Audio context refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const micGainRef = useRef<GainNode | null>(null);
  const musicGainRef = useRef<GainNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micLevelRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);

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

  // Poll live listener count every 10s when broadcasting
  useEffect(() => {
    if (!isLive) { setLiveListeners(0); return; }

    async function fetchCount() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { count } = await supabase
        .from("listener_sessions")
        .select("*", { count: "exact", head: true })
        .eq("broadcaster_id", user.id)
        .is("ended_at", null);
      setLiveListeners(count ?? 0);
    }

    fetchCount();
    const interval = setInterval(fetchCount, 10000);
    return () => clearInterval(interval);
  }, [isLive, supabase]);

  // Load tracks on mount (needed for selection before going live)
  useEffect(() => {
    async function loadTracks() {
      setTracksLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("tracks")
        .select("id, title, primary_artist, file_url, duration_seconds, is_active")
        .eq("broadcaster_id", user.id)
        .eq("is_active", true)
        .order("title");

      const loadedTracks = (data as Track[]) || [];
      setTracks(loadedTracks);
      // Start with nothing selected — broadcaster chooses what to broadcast
      setSelectedTrackIds(new Set());
      setTracksLoading(false);
    }
    loadTracks();
  }, [supabase]);

  // Load AI host config
  useEffect(() => {
    async function loadAiHostConfig() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if broadcaster has AI host config
      const { data: config } = await supabase
        .from("broadcaster_agent_configs")
        .select("ai_host_enabled")
        .eq("broadcaster_id", user.id)
        .single();

      // Check subscriptions
      const { data: subs } = await supabase
        .from("agent_subscriptions")
        .select("role, agent:ai_agents(name)")
        .eq("broadcaster_id", user.id)
        .eq("status", "active");

      if (subs && subs.length > 0) {
        setAiHostAvailable(true);
        setSubscribedAgents(subs.map((s: any) => ({
          name: (s.agent as any)?.name ?? "Unknown",
          role: s.role,
        })));
        if (config) {
          setAiHostEnabled(config.ai_host_enabled);
        }
      }
    }
    loadAiHostConfig();
  }, [supabase]);

  // Load approved ads when ads panel opens
  useEffect(() => {
    if (activePanel !== "ads") return;
    async function loadAds() {
      setAdsLoading(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("ad_requests")
        .select(`
          id, frequency,
          advert:adverts(title, file_url, duration_seconds),
          advertiser:profiles!ad_requests_advertiser_id_fkey(display_name)
        `)
        .eq("broadcaster_id", user.id)
        .eq("status", "approved")
        .order("responded_at", { ascending: false });

      setApprovedAds((data as any) || []);
      setAdsLoading(false);
    }
    loadAds();
  }, [activePanel, supabase]);

  // Fetch broadcast queue to know which tracks are live in rotation
  useEffect(() => {
    if (!isLive || !channelSlug) { setLiveQueueFilenames(new Set()); return; }
    async function fetchQueue() {
      try {
        const res = await fetch(`/api/channels/${channelSlug}/queue`);
        if (res.ok) {
          const data = await res.json();
          if (data.queue && Array.isArray(data.queue)) {
            setLiveQueueFilenames(new Set(data.queue as string[]));
          }
        }
      } catch { /* ignore */ }
    }
    fetchQueue();
  }, [isLive, channelSlug]);

  // Poll now-playing metadata when live
  const lastTrackRef = useRef<string | null>(null);
  useEffect(() => {
    if (!isLive || !channelSlug) return;
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/metadata/api/channels/${channelSlug}/now-playing`;

    async function poll() {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        if (data.track && !data.ended) {
          // Only reset elapsed timer when track actually changes
          const trackKey = `${data.track.title}::${data.track.artist}`;
          if (trackKey !== lastTrackRef.current) {
            lastTrackRef.current = trackKey;
            trackStartTimeRef.current = Date.now();
            setTrackElapsed(0);
          }
          setNowPlaying(data.track.title);
          setNowPlayingArtist(data.track.artist || null);
          setNowPlayingType(data.type || "track");
          setTrackDuration(data.duration || 0);
        } else if (data.ended) {
          setNowPlaying(null);
          setNowPlayingArtist(null);
          setNowPlayingType("track");
          setTrackDuration(0);
          setTrackElapsed(0);
          lastTrackRef.current = null;
        }
      } catch { /* ignore */ }
    }

    poll();
    const interval = setInterval(poll, 1000);
    return () => clearInterval(interval);
  }, [isLive, channelSlug]);

  // Elapsed time ticker
  useEffect(() => {
    if (!isLive || !nowPlaying || trackDuration === 0) return;
    const interval = setInterval(() => {
      const elapsed = (Date.now() - trackStartTimeRef.current) / 1000;
      setTrackElapsed(Math.min(elapsed, trackDuration));
    }, 250);
    return () => clearInterval(interval);
  }, [isLive, nowPlaying, trackDuration]);

  // Update music gain when volume changes
  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.value = musicVolume / 100;
    }
  }, [musicVolume]);

  // Update mic gain when volume changes
  useEffect(() => {
    if (micGainRef.current) {
      micGainRef.current.gain.value = micVolume / 100;
    }
  }, [micVolume]);

  // Mic level visualizer
  const animateMicLevel = useCallback(() => {
    if (!analyserRef.current || !micLevelRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((a, b) => a + b, 0) / data.length;
    const pct = Math.min(100, (avg / 128) * 100);
    micLevelRef.current.style.width = `${pct}%`;
    animFrameRef.current = requestAnimationFrame(animateMicLevel);
  }, []);

  async function toggleMic() {
    if (micActive && micStream) {
      // Stop mic
      micStream.getTracks().forEach((t) => t.stop());
      setMicStream(null);
      setMicActive(false);
      cancelAnimationFrame(animFrameRef.current);
      if (micLevelRef.current) micLevelRef.current.style.width = "0%";
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicStream(stream);
      setMicActive(true);

      // Set up Web Audio for level metering
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      const source = ctx.createMediaStreamSource(stream);
      const gainNode = ctx.createGain();
      gainNode.gain.value = micVolume / 100;
      micGainRef.current = gainNode;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      source.connect(gainNode);
      gainNode.connect(analyser);
      // Don't connect to destination to avoid feedback

      animateMicLevel();
    } catch {
      setMessage("Microphone access denied");
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      micStream?.getTracks().forEach((t) => t.stop());
    };
  }, [micStream]);

  // Derive the server-side filename from track metadata (matches track-sync.ts logic)
  function getServerFilename(track: Track): string {
    try {
      const ext = new URL(track.file_url).pathname.split(".").pop() || "mp3";
      const safeName = `${track.primary_artist} - ${track.title}`
        .replace(/[^a-zA-Z0-9\s\-_.]/g, "")
        .trim();
      return `${safeName}.${ext}`;
    } catch {
      return `${track.primary_artist} - ${track.title}.mp3`;
    }
  }

  async function handleCue(track: Track) {
    const filename = getServerFilename(track);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cue", filename }),
      });
      if (res.ok) {
        setCuedFilename(filename);
      }
    } catch { /* ignore */ }
  }

  async function handlePlay(track: Track) {
    const filename = getServerFilename(track);
    setSkipping(true);
    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "skip", filename }),
      });
      if (res.ok) {
        setCuedFilename(null);
      }
    } catch { /* ignore */ }
    setSkipping(false);
  }

  function toggleTrackSelection(trackId: string) {
    setSelectedTrackIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) next.delete(trackId);
      else next.add(trackId);
      return next;
    });
  }

  function selectAllTracks() {
    setSelectedTrackIds(new Set(tracks.map((t) => t.id)));
  }

  function deselectAllTracks() {
    setSelectedTrackIds(new Set());
  }

  async function toggleAiHost() {
    const newVal = !aiHostEnabled;
    setAiHostEnabled(newVal);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("broadcaster_agent_configs")
      .upsert({ broadcaster_id: user.id, ai_host_enabled: newVal, updated_at: new Date().toISOString() }, { onConflict: "broadcaster_id" });
  }

  async function toggleBroadcast() {
    setToggling(true);
    setMessage("");

    if (!isLive && selectedTrackIds.size === 0) {
      setMessage("Select at least one track to broadcast");
      setToggling(false);
      return;
    }

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: isLive ? "stop" : "start",
          ...(isLive ? {} : { track_ids: Array.from(selectedTrackIds), use_ai_host: aiHostEnabled }),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data.error || "Failed");
        setToggling(false);
        return;
      }

      setIsLive(!isLive);
      setMessage(isLive ? "Channel is now offline" : "Channel is now live!");
      if (isLive) {
        setNowPlaying(null);
        // Stop mic when going offline
        if (micStream) {
          micStream.getTracks().forEach((t) => t.stop());
          setMicStream(null);
          setMicActive(false);
        }
      }
    } catch {
      setMessage("Broadcast server unavailable");
    }

    setToggling(false);
  }

  function formatDuration(s: number | null) {
    if (!s) return "—";
    const m = Math.floor(s / 60);
    const sec = Math.round(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  }

  if (loading) {
    return <InlineLoader />;
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
          0%, 100% { box-shadow: 0 0 20px rgba(74, 222, 128, 0.3); }
          50% { box-shadow: 0 0 40px rgba(74, 222, 128, 0.6), 0 0 60px rgba(74, 222, 128, 0.2); }
        }
        .live-glow {
          animation: live-pulse 2s ease-in-out infinite;
        }
        @keyframes mic-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(226, 74, 74, 0.4); }
          50% { box-shadow: 0 0 0 6px rgba(226, 74, 74, 0); }
        }
        .mic-active-pulse {
          animation: mic-pulse 1.5s ease-in-out infinite;
        }
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 100%;
          height: 4px;
          background: #27272a;
          outline: none;
          border-radius: 0;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 14px;
          height: 14px;
          background: #f59e0b;
          cursor: pointer;
          border-radius: 0;
          border: none;
        }
        .volume-slider.mic-slider::-webkit-slider-thumb {
          background: #E24A4A;
        }
        .panel-btn {
          flex: 1;
          padding: 10px;
          border: 1px solid #27272a;
          background: transparent;
          color: #a1a1aa;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          cursor: pointer;
          font-family: var(--font-mono);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: all 0.15s;
        }
        .panel-btn:hover {
          border-color: #f59e0b;
          color: #f59e0b;
        }
        .panel-btn.active {
          border-color: #f59e0b;
          color: #f59e0b;
          background: rgba(245, 158, 11, 0.08);
        }
        @keyframes orange-blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.25; }
        }
        @keyframes active-pulse {
          0%, 100% { color: #4ADE80; }
          50% { color: #86efac; }
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
        Go Live<span style={{ color: "#f59e0b" }}>_</span>
      </h1>
      <p style={{
        color: "#52525b",
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "24px",
      }}>
        /{channelSlug} — {channelName}
      </p>

      {/* Status card */}
      <div className={isLive ? "live-glow" : ""} style={{
        padding: "24px",
        backgroundColor: isLive ? "rgba(74, 222, 128, 0.06)" : "rgba(24, 24, 27, 0.3)",
        borderLeft: isLive ? "4px solid #4ADE80" : "2px solid #27272a",
        marginBottom: "16px",
        textAlign: "center",
      }}>
        <div style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "12px",
        }}>
          <div style={{
            width: "10px",
            height: "10px",
            borderRadius: "50%",
            backgroundColor: isLive ? "#4ADE80" : "#3f3f46",
            boxShadow: isLive ? "0 0 8px rgba(74, 222, 128, 0.8)" : "none",
          }} />
          <span style={{
            fontSize: "18px",
            fontWeight: 700,
            color: isLive ? "#4ADE80" : "#52525b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            {isLive ? "ON AIR" : "OFFLINE"}
          </span>
          {isLive && (
            <span style={{
              fontSize: "11px",
              color: "#a1a1aa",
              display: "flex",
              alignItems: "center",
              gap: "5px",
              marginLeft: "8px",
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              <span style={{ color: "#f59e0b", fontWeight: 700 }}>{liveListeners}</span>
              <span style={{ fontSize: "9px", color: "#52525b" }}>LIVE</span>
            </span>
          )}
        </div>

        {isLive && nowPlaying && (
          <div style={{ marginBottom: "12px", textAlign: "left", padding: "0 4px" }}>
            {/* Host segment indicator */}
            {nowPlayingType === "host_segment" && (
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                marginBottom: "6px",
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#78B3CE" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                </svg>
                <span style={{
                  fontSize: "10px",
                  fontWeight: 700,
                  color: "#78B3CE",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: "var(--font-mono)",
                }}>
                  AI HOST TALKING
                </span>
              </div>
            )}
            {/* Track title + artist */}
            <div style={{
              fontSize: "12px",
              color: nowPlayingType === "host_segment" ? "#78B3CE" : "#fbbf24",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "4px",
              fontWeight: 600,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              {nowPlayingType === "host_segment" ? "DJ Segment" : nowPlaying}
            </div>
            {nowPlayingArtist && (
              <div style={{
                fontSize: "10px",
                color: "#71717a",
                marginBottom: "10px",
              }}>
                {nowPlayingArtist}
              </div>
            )}

            {/* Progress bar */}
            {trackDuration > 0 && (
              <>
                <div style={{
                  height: "3px",
                  backgroundColor: "#27272a",
                  position: "relative",
                  overflow: "hidden",
                  marginBottom: "6px",
                }}>
                  <div style={{
                    height: "100%",
                    width: `${(trackElapsed / trackDuration) * 100}%`,
                    backgroundColor: "#f59e0b",
                    transition: "width 0.25s linear",
                  }} />
                </div>

                {/* Time labels */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  color: "#52525b",
                }}>
                  <span>{formatDuration(trackElapsed)}</span>
                  <span>-{formatDuration(trackDuration - trackElapsed)}</span>
                </div>
              </>
            )}
          </div>
        )}

        <div style={{
          fontSize: "11px",
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          {isLive
            ? `${trackCount} active track${trackCount !== 1 ? "s" : ""} ready`
            : `${selectedTrackIds.size} of ${tracks.length} track${tracks.length !== 1 ? "s" : ""} selected`
          }
        </div>
      </div>

      {/* ──── AI HOST TOGGLE ──── */}
      {!isLive && (
        <div style={{
          backgroundColor: aiHostEnabled ? "rgba(120, 179, 206, 0.06)" : "rgba(24, 24, 27, 0.3)",
          borderLeft: aiHostEnabled ? "3px solid #78B3CE" : "2px solid #27272a",
          padding: "16px",
          marginBottom: "16px",
        }}>
          <div style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: aiHostAvailable ? "12px" : 0,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={aiHostEnabled ? "#78B3CE" : "#52525b"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <div>
                <div style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  color: aiHostEnabled ? "#78B3CE" : "#a1a1aa",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  fontFamily: "var(--font-mono)",
                }}>
                  AI RADIO HOST
                </div>
                <div style={{ fontSize: "10px", color: "#52525b", marginTop: "2px" }}>
                  {aiHostAvailable
                    ? "AI hosts introduce tracks and chat between songs"
                    : "Subscribe to AI hosts in the marketplace"
                  }
                </div>
              </div>
            </div>

            {aiHostAvailable ? (
              <button
                onClick={toggleAiHost}
                style={{
                  width: "44px",
                  height: "24px",
                  borderRadius: "12px",
                  backgroundColor: aiHostEnabled ? "#78B3CE" : "#27272a",
                  border: aiHostEnabled ? "1px solid #78B3CE" : "1px solid #3f3f46",
                  cursor: "pointer",
                  position: "relative",
                  transition: "all 0.2s",
                  flexShrink: 0,
                }}
              >
                <div style={{
                  width: "18px",
                  height: "18px",
                  borderRadius: "50%",
                  backgroundColor: aiHostEnabled ? "#fff" : "#52525b",
                  position: "absolute",
                  top: "2px",
                  left: aiHostEnabled ? "22px" : "2px",
                  transition: "left 0.2s",
                }} />
              </button>
            ) : (
              <a href="/broadcast/agents" style={{
                fontSize: "10px",
                color: "#f59e0b",
                textDecoration: "none",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                padding: "6px 10px",
                border: "1px solid #f59e0b",
              }}>
                Browse Agents
              </a>
            )}
          </div>

          {/* Show subscribed agents summary */}
          {aiHostAvailable && aiHostEnabled && subscribedAgents.length > 0 && (
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              {subscribedAgents.map((agent, i) => (
                <div key={i} style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  padding: "4px 10px",
                  backgroundColor: "rgba(120, 179, 206, 0.08)",
                  border: "1px solid rgba(120, 179, 206, 0.2)",
                }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#78B3CE",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {agent.name}
                  </span>
                  <span style={{
                    fontSize: "8px",
                    fontWeight: 700,
                    color: agent.role === "primary" ? "#4ADE80" : "#f59e0b",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {agent.role}
                  </span>
                </div>
              ))}
              <a href="/broadcast/agents" style={{
                fontSize: "9px",
                color: "#52525b",
                textDecoration: "none",
                textTransform: "uppercase",
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.05em",
                display: "flex",
                alignItems: "center",
                padding: "4px 8px",
              }}>
                Manage
              </a>
            </div>
          )}
        </div>
      )}

      {/* ──── TRACK SELECTION (before going live) ──── */}
      {!isLive && (
        <div style={{
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderLeft: "3px solid #f59e0b",
          overflow: "hidden",
          marginBottom: "16px",
        }}>
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1a1a1e",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <span style={{
              fontSize: "10px",
              color: "#f59e0b",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              fontFamily: "var(--font-mono)",
            }}>
              SELECT TRACKS TO BROADCAST
            </span>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                onClick={selectAllTracks}
                style={{
                  fontSize: "9px", color: "#71717a", background: "none", border: "none",
                  cursor: "pointer", textTransform: "uppercase", fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                }}
              >All</button>
              <button
                onClick={deselectAllTracks}
                style={{
                  fontSize: "9px", color: "#71717a", background: "none", border: "none",
                  cursor: "pointer", textTransform: "uppercase", fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                }}
              >None</button>
              <a href="/broadcast/tracks/upload" style={{
                fontSize: "9px", color: "#71717a", textDecoration: "none",
                textTransform: "uppercase", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
              }}>+ Upload</a>
            </div>
          </div>

          {tracksLoading ? (
            <div style={{ padding: "20px" }}><InlineLoader /></div>
          ) : tracks.length === 0 ? (
            <div style={{ padding: "32px 16px", textAlign: "center" }}>
              <p style={{
                color: "#52525b", fontSize: "11px", textTransform: "uppercase",
                fontFamily: "var(--font-mono)", marginBottom: "8px",
              }}>No active tracks</p>
              <a href="/broadcast/tracks/upload" style={{
                color: "#f59e0b", fontSize: "11px", textDecoration: "none",
                textTransform: "uppercase", fontFamily: "var(--font-mono)",
              }}>Upload tracks to get started</a>
            </div>
          ) : (
            <div style={{ maxHeight: "400px", overflowY: "auto" }}>
              {tracks.map((track) => {
                const isSelected = selectedTrackIds.has(track.id);
                return (
                  <div
                    key={track.id}
                    onClick={() => toggleTrackSelection(track.id)}
                    style={{
                      padding: "10px 16px",
                      borderBottom: "1px solid rgba(39, 39, 42, 0.5)",
                      backgroundColor: isSelected ? "rgba(245, 158, 11, 0.06)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      transition: "background-color 0.1s",
                    }}
                  >
                    {/* Checkbox */}
                    <div style={{
                      width: "18px",
                      height: "18px",
                      border: isSelected ? "2px solid #f59e0b" : "2px solid #3f3f46",
                      backgroundColor: isSelected ? "#f59e0b" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "all 0.1s",
                    }}>
                      {isSelected && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#0a0a0a" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </div>

                    {/* Track info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: "12px",
                        fontWeight: 600,
                        color: isSelected ? "var(--text-primary)" : "#71717a",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}>
                        {track.title}
                      </div>
                      <div style={{ fontSize: "10px", color: "#52525b" }}>
                        {track.primary_artist} · {formatDuration(track.duration_seconds)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Go Live / Stop button */}
      <button
        onClick={toggleBroadcast}
        disabled={toggling || (!isLive && selectedTrackIds.size === 0)}
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
          cursor: toggling || (!isLive && selectedTrackIds.size === 0) ? "not-allowed" : "pointer",
          opacity: toggling || (!isLive && selectedTrackIds.size === 0) ? 0.6 : 1,
          fontFamily: "'JetBrains Mono', monospace",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "10px",
          marginBottom: "8px",
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
            {toggling ? "STARTING..." : `GO LIVE (${selectedTrackIds.size} TRACK${selectedTrackIds.size !== 1 ? "S" : ""}${aiHostEnabled ? " + AI HOST" : ""})`}
          </>
        )}
      </button>

      {!isLive && tracks.length === 0 && (
        <p style={{
          fontSize: "11px",
          color: "#52525b",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginTop: "4px",
          marginBottom: "16px",
          textAlign: "center",
        }}>
          Upload and activate tracks before going live
        </p>
      )}

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

      {/* ──────── MIXER CONTROLS ──────── */}
      {isLive && (
        <>
          <div style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#52525b",
            marginBottom: "10px",
            marginTop: "8px",
          }}>
            {"// MIXER_CONTROLS"}
          </div>

          {/* Mic toggle + level */}
          <div style={{
            padding: "16px",
            backgroundColor: micActive ? "rgba(226, 74, 74, 0.06)" : "rgba(24, 24, 27, 0.3)",
            borderLeft: micActive ? "3px solid #E24A4A" : "2px solid #27272a",
            marginBottom: "8px",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: micActive ? "12px" : 0 }}>
              <button
                onClick={toggleMic}
                className={micActive ? "mic-active-pulse" : ""}
                style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  backgroundColor: micActive ? "#E24A4A" : "#27272a",
                  border: micActive ? "2px solid #E24A4A" : "2px solid #3f3f46",
                  color: micActive ? "#fff" : "#71717a",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                  {!micActive && <>
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </>}
                </svg>
              </button>

              <div style={{ flex: 1 }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "4px",
                }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: micActive ? "#E24A4A" : "#71717a",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {micActive ? "MIC LIVE" : "MIC OFF"}
                  </span>
                  <span style={{
                    fontSize: "10px",
                    color: "#52525b",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {micVolume}%
                  </span>
                </div>

                {/* Mic level meter */}
                {micActive && (
                  <div style={{
                    height: "3px",
                    backgroundColor: "#27272a",
                    marginBottom: "8px",
                    overflow: "hidden",
                  }}>
                    <div
                      ref={micLevelRef}
                      style={{
                        height: "100%",
                        width: "0%",
                        backgroundColor: "#E24A4A",
                        transition: "width 0.05s linear",
                      }}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Mic volume slider */}
            {micActive && (
              <div style={{ paddingLeft: "52px" }}>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={micVolume}
                  onChange={(e) => setMicVolume(Number(e.target.value))}
                  className="volume-slider mic-slider"
                />
              </div>
            )}
          </div>

          {/* Music volume */}
          <div style={{
            padding: "16px",
            backgroundColor: "rgba(24, 24, 27, 0.3)",
            borderLeft: "3px solid #f59e0b",
            marginBottom: "16px",
          }}>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}>
              <div style={{
                width: "40px",
                height: "40px",
                borderRadius: "50%",
                backgroundColor: "#27272a",
                border: "2px solid #f59e0b",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18V5l12-2v13" />
                  <circle cx="6" cy="18" r="3" />
                  <circle cx="18" cy="16" r="3" />
                </svg>
              </div>

              <div style={{ flex: 1 }}>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "8px",
                }}>
                  <span style={{
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "#f59e0b",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontFamily: "var(--font-mono)",
                  }}>
                    MUSIC VOLUME
                  </span>
                  <span style={{
                    fontSize: "10px",
                    color: "#52525b",
                    fontFamily: "var(--font-mono)",
                  }}>
                    {musicVolume}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={musicVolume}
                  onChange={(e) => setMusicVolume(Number(e.target.value))}
                  className="volume-slider"
                />
              </div>
            </div>
          </div>

          {/* ──────── CTA PANELS ──────── */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
            <button
              className={`panel-btn ${activePanel === "music" ? "active" : ""}`}
              onClick={() => setActivePanel(activePanel === "music" ? "none" : "music")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13" />
                <circle cx="6" cy="18" r="3" />
                <circle cx="18" cy="16" r="3" />
              </svg>
              Music
            </button>
            <button
              className={`panel-btn ${activePanel === "ads" ? "active" : ""}`}
              onClick={() => setActivePanel(activePanel === "ads" ? "none" : "ads")}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              Ads
              {approvedAds.length > 0 && (
                <span style={{
                  backgroundColor: "#4ADE80",
                  color: "#0a0a0a",
                  fontSize: "9px",
                  fontWeight: 700,
                  padding: "1px 5px",
                  borderRadius: "2px",
                  marginLeft: "2px",
                }}>
                  {approvedAds.length}
                </span>
              )}
            </button>
          </div>

          {/* Music Panel */}
          {activePanel === "music" && (
            <div style={{
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              borderLeft: "3px solid #f59e0b",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid #1a1a1e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{
                  fontSize: "10px",
                  color: "#f59e0b",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono)",
                }}>
                  TRACK LIBRARY — {tracks.length} tracks
                </span>
                <a href="/broadcast/tracks/upload" style={{
                  fontSize: "10px",
                  color: "#71717a",
                  textDecoration: "none",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                }}>
                  + Upload
                </a>
              </div>

              {tracksLoading ? (
                <div style={{ padding: "20px" }}><InlineLoader /></div>
              ) : tracks.length === 0 ? (
                <div style={{
                  padding: "32px 16px",
                  textAlign: "center",
                }}>
                  <p style={{
                    color: "#52525b",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                    marginBottom: "8px",
                  }}>
                    No active tracks
                  </p>
                  <a href="/broadcast/tracks/upload" style={{
                    color: "#f59e0b",
                    fontSize: "11px",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                  }}>
                    Upload tracks to get started
                  </a>
                </div>
              ) : (
                <div style={{ maxHeight: "400px", overflowY: "auto" }}>
                  {tracks.map((track) => {
                    const isCurrentlyPlaying = nowPlaying?.toLowerCase() === track.title.toLowerCase();
                    const serverFilename = getServerFilename(track);
                    const isCued = cuedFilename === serverFilename;
                    const isInLiveQueue = liveQueueFilenames.has(serverFilename);
                    const isBroadcasting = isInLiveQueue || isCurrentlyPlaying;

                    return (
                      <div key={track.id} style={{
                        padding: "10px 16px",
                        borderBottom: "1px solid rgba(39, 39, 42, 0.5)",
                        backgroundColor: isCurrentlyPlaying
                          ? "rgba(245, 158, 11, 0.06)"
                          : isBroadcasting
                          ? "rgba(245, 158, 11, 0.03)"
                          : isCued
                          ? "rgba(74, 222, 128, 0.04)"
                          : "transparent",
                      }}>
                        <div style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                        }}>
                          {/* Status indicator: orange blinking box for live, gray dot for idle */}
                          {isBroadcasting ? (
                            <div style={{
                              width: "14px",
                              height: "14px",
                              backgroundColor: "#f59e0b",
                              flexShrink: 0,
                              animation: "orange-blink 1.2s ease-in-out infinite",
                            }} />
                          ) : (
                            <div style={{
                              width: "6px",
                              height: "6px",
                              borderRadius: "50%",
                              backgroundColor: isCued ? "#4ADE80" : "#3f3f46",
                              boxShadow: isCued ? "0 0 6px rgba(74, 222, 128, 0.6)" : "none",
                              flexShrink: 0,
                            }} />
                          )}

                          {/* Track info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: "12px",
                              fontWeight: 600,
                              color: isCurrentlyPlaying ? "#f59e0b" : isBroadcasting ? "var(--text-primary)" : isCued ? "#4ADE80" : "var(--text-primary)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                            }}>
                              {track.title}
                              {isCued && !isBroadcasting && (
                                <span style={{
                                  fontSize: "9px",
                                  color: "#4ADE80",
                                  marginLeft: "6px",
                                  fontFamily: "var(--font-mono)",
                                  letterSpacing: "0.05em",
                                }}>
                                  CUED
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "10px", color: "#52525b" }}>
                              {track.primary_artist} · {formatDuration(track.duration_seconds)}
                            </div>
                          </div>

                          {/* Action buttons (cue/skip) — only for non-playing live tracks */}
                          {isBroadcasting && !isCurrentlyPlaying && (
                            <div style={{ display: "flex", gap: "4px", flexShrink: 0 }}>
                              <button
                                onClick={() => handleCue(track)}
                                title="Cue next"
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  backgroundColor: isCued ? "rgba(74, 222, 128, 0.15)" : "transparent",
                                  border: isCued ? "1px solid #4ADE80" : "1px solid #3f3f46",
                                  color: isCued ? "#4ADE80" : "#71717a",
                                  cursor: "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "0px",
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                  <polyline points="5 12 12 5 19 12" />
                                  <line x1="12" y1="19" x2="12" y2="5" />
                                </svg>
                              </button>
                              <button
                                onClick={() => handlePlay(track)}
                                disabled={skipping}
                                title="Play now"
                                style={{
                                  width: "28px",
                                  height: "28px",
                                  backgroundColor: "transparent",
                                  border: "1px solid #f59e0b",
                                  color: "#f59e0b",
                                  cursor: skipping ? "not-allowed" : "pointer",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  borderRadius: "0px",
                                  opacity: skipping ? 0.5 : 1,
                                }}
                              >
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                                  <polygon points="5,3 19,12 5,21" />
                                </svg>
                              </button>
                            </div>
                          )}

                          {/* ACTIVE status for broadcasting tracks / PLAYING for current */}
                          <span style={{
                            fontSize: "9px",
                            fontWeight: 700,
                            textTransform: "uppercase",
                            fontFamily: "var(--font-mono)",
                            letterSpacing: "0.05em",
                            flexShrink: 0,
                            color: isCurrentlyPlaying ? "#f59e0b" : isBroadcasting ? "#4ADE80" : "transparent",
                            animation: isBroadcasting && !isCurrentlyPlaying ? "active-pulse 2s ease-in-out infinite" : "none",
                          }}>
                            {isCurrentlyPlaying ? "PLAYING" : isBroadcasting ? "ACTIVE" : ""}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Ads Panel — Approved ads ready to broadcast */}
          {activePanel === "ads" && (
            <div style={{
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              borderLeft: "3px solid #f59e0b",
              overflow: "hidden",
            }}>
              <div style={{
                padding: "12px 16px",
                borderBottom: "1px solid #1a1a1e",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}>
                <span style={{
                  fontSize: "10px",
                  color: "#f59e0b",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  fontFamily: "var(--font-mono)",
                }}>
                  APPROVED ADS — {approvedAds.length} ready
                </span>
                <a href="/broadcast/ads" style={{
                  fontSize: "10px",
                  color: "#71717a",
                  textDecoration: "none",
                  textTransform: "uppercase",
                  fontFamily: "var(--font-mono)",
                  letterSpacing: "0.05em",
                }}>
                  Manage All
                </a>
              </div>

              {adsLoading ? (
                <div style={{ padding: "20px" }}><InlineLoader /></div>
              ) : approvedAds.length === 0 ? (
                <div style={{
                  padding: "32px 16px",
                  textAlign: "center",
                }}>
                  <p style={{
                    color: "#52525b",
                    fontSize: "11px",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                    marginBottom: "8px",
                  }}>
                    No approved ads ready
                  </p>
                  <a href="/broadcast/ads" style={{
                    color: "#f59e0b",
                    fontSize: "11px",
                    textDecoration: "none",
                    textTransform: "uppercase",
                    fontFamily: "var(--font-mono)",
                  }}>
                    Review pending requests
                  </a>
                </div>
              ) : (
                <div style={{ maxHeight: "300px", overflowY: "auto" }}>
                  {approvedAds.map((ad) => {
                    const advert = ad.advert as any;
                    const advertiser = ad.advertiser as any;
                    return (
                      <AdRow
                        key={ad.id}
                        title={advert?.title ?? "Unknown Ad"}
                        advertiser={advertiser?.display_name ?? "Unknown"}
                        frequency={ad.frequency}
                        fileUrl={advert?.file_url}
                        duration={advert?.duration_seconds}
                        formatDuration={formatDuration}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AdRow({ title, advertiser, frequency, fileUrl, duration, formatDuration }: {
  title: string;
  advertiser: string;
  frequency: string;
  fileUrl: string | null;
  duration: number | null;
  formatDuration: (s: number | null) => string;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);

  function togglePlay() {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } else {
      audioRef.current.play();
    }
    setPlaying(!playing);
  }

  return (
    <div style={{
      padding: "10px 16px",
      borderBottom: "1px solid rgba(39, 39, 42, 0.5)",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    }}>
      {/* Play preview button */}
      {fileUrl && (
        <>
          <audio
            ref={audioRef}
            src={fileUrl}
            onEnded={() => setPlaying(false)}
            preload="none"
          />
          <button
            onClick={togglePlay}
            style={{
              width: "28px",
              height: "28px",
              backgroundColor: playing ? "rgba(245, 158, 11, 0.15)" : "transparent",
              border: "1px solid #f59e0b",
              color: "#f59e0b",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "0px",
              flexShrink: 0,
            }}
          >
            {playing ? (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <rect x="6" y="4" width="4" height="16" />
                <rect x="14" y="4" width="4" height="16" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                <polygon points="5,3 19,12 5,21" />
              </svg>
            )}
          </button>
        </>
      )}

      {/* Ad info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "12px",
          fontWeight: 600,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}>
          {title}
        </div>
        <div style={{ fontSize: "10px", color: "#52525b" }}>
          {advertiser} · {frequency}
        </div>
      </div>

      {/* Duration + status */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        <span style={{
          fontSize: "10px",
          color: "#52525b",
          fontFamily: "var(--font-mono)",
        }}>
          {formatDuration(duration)}
        </span>
        <span style={{
          fontSize: "9px",
          fontWeight: 700,
          color: "#4ADE80",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
        }}>
          READY
        </span>
      </div>
    </div>
  );
}

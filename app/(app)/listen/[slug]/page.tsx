"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Visualizer from "@/app/components/Visualizer";
import { useStream } from "@/app/hooks/useStream";
import Lottie from "lottie-react";
import type { LottieRefCurrentProps } from "lottie-react";
import heartAnimation from "@/public/heart.json";
import InlineLoader from "@/app/components/InlineLoader";

interface ChannelInfo {
  channel_name: string;
  channel_slug: string;
  genre: string[] | null;
  is_live: boolean;
  monthly_listeners: number;
  profile: { display_name: string; bio: string | null };
}

export default function ChannelPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const supabase = createClient();

  const [channel, setChannel] = useState<ChannelInfo | null>(null);
  const [allSlugs, setAllSlugs] = useState<string[]>([]);
  const [metadata, setMetadata] = useState({
    track: null as { title: string; artist: string } | null,
    upcoming: [] as { title: string; artist: string; duration?: number }[],
    duration: 0,
    trackStartOffset: 0,
    ended: false,
    isLive: false,
  });

  const stream = useStream(metadata.trackStartOffset, metadata.duration, slug);

  // Favorite state
  const [isFavorited, setIsFavorited] = useState(false);
  const heartRef = useRef<LottieRefCurrentProps>(null);

  // Follow state
  const [isFollowing, setIsFollowing] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [broadcasterId, setBroadcasterId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Share state
  const [showShareToast, setShowShareToast] = useState(false);

  // Check follow status
  useEffect(() => {
    async function checkFollow() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: ch } = await supabase
        .from("broadcaster_profiles")
        .select("id")
        .eq("channel_slug", slug)
        .single();
      if (!ch) return;
      setBroadcasterId(ch.id);

      const { data: follow } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", user.id)
        .eq("broadcaster_id", ch.id)
        .maybeSingle();
      setIsFollowing(!!follow);
    }
    checkFollow();
  }, [slug, supabase]);

  async function toggleFollow() {
    if (!currentUserId || !broadcasterId || togglingFollow) return;
    setTogglingFollow(true);

    if (isFollowing) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", currentUserId)
        .eq("broadcaster_id", broadcasterId);
      setIsFollowing(false);
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: currentUserId, broadcaster_id: broadcasterId });
      setIsFollowing(true);
    }
    setTogglingFollow(false);
  }

  useEffect(() => {
    // Check DB for like status
    async function checkLike() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from("channel_likes")
          .select("id")
          .eq("user_id", user.id)
          .eq("channel_slug", slug)
          .maybeSingle();
        setIsFavorited(!!data);
      } else {
        // Fallback to localStorage for unauthenticated
        try {
          const favs: string[] = JSON.parse(localStorage.getItem("radio1_favorites") || "[]");
          setIsFavorited(favs.includes(slug));
        } catch { /* ignore */ }
      }
    }
    checkLike();
  }, [slug]);

  const [heartAnimating, setHeartAnimating] = useState(false);

  // Set initial frame based on favorite state
  useEffect(() => {
    if (heartRef.current) {
      heartRef.current.goToAndStop(0, true);
    }
  }, []);

  async function toggleFavorite() {
    const { data: { user } } = await supabase.auth.getUser();

    if (isFavorited) {
      setIsFavorited(false);
      if (user) {
        await supabase.from("channel_likes").delete()
          .eq("user_id", user.id).eq("channel_slug", slug);
      }
    } else {
      setIsFavorited(true);
      // Play the fill animation briefly
      setHeartAnimating(true);
      if (heartRef.current) {
        heartRef.current.goToAndPlay(0, true);
      }
      setTimeout(() => setHeartAnimating(false), 350);
      if (user) {
        await supabase.from("channel_likes").upsert({
          user_id: user.id, channel_slug: slug,
        }, { onConflict: "user_id,channel_slug" });
      }
    }
  }

  // Load channel info + all channel slugs for prev/next navigation
  useEffect(() => {
    async function loadChannel() {
      const { data } = await supabase
        .from("broadcaster_profiles")
        .select("channel_name, channel_slug, genre, is_live, monthly_listeners, profile:profiles!broadcaster_profiles_id_fkey(display_name, bio)")
        .eq("channel_slug", slug)
        .single();
      setChannel(data as any);
    }
    async function loadAllSlugs() {
      const { data } = await supabase
        .from("broadcaster_profiles")
        .select("channel_slug")
        .order("channel_name", { ascending: true });
      if (data) setAllSlugs(data.map((c) => c.channel_slug));
    }
    loadChannel();
    loadAllSlugs();
  }, [slug, supabase]);

  const currentIndex = allSlugs.indexOf(slug);
  const prevSlug = currentIndex > 0 ? allSlugs[currentIndex - 1] : allSlugs[allSlugs.length - 1];
  const nextSlug = currentIndex < allSlugs.length - 1 ? allSlugs[currentIndex + 1] : allSlugs[0];
  const canNavigate = allSlugs.length > 1;

  // Connect to per-channel metadata SSE
  useEffect(() => {
    const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
    const url = `http://${host}:8001/channels/${slug}/now-playing`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      eventSource = new EventSource(url);
      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setMetadata({
            track: data.track ?? null,
            upcoming: data.upcoming ?? [],
            duration: data.duration ?? 0,
            trackStartOffset: data.trackStartOffset ?? 0,
            ended: data.ended ?? false,
            isLive: !data.ended,
          });
        } catch { /* ignore */ }
      };
      eventSource.onerror = () => {
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();
    return () => {
      eventSource?.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [slug]);

  // Auto-stop on broadcast end
  useEffect(() => {
    if (metadata.ended && stream.isPlaying) {
      stream.stop();
    }
  }, [metadata.ended, stream.isPlaying, stream.stop]);

  // Track listener session
  useEffect(() => {
    let sessionId: string | null = null;
    async function startSession() {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: ch } = await supabase
        .from("broadcaster_profiles")
        .select("id")
        .eq("channel_slug", slug)
        .single();
      if (ch) {
        const { data } = await supabase.from("listener_sessions").insert({
          listener_id: user?.id ?? null,
          broadcaster_id: ch.id,
        }).select("id").single();
        sessionId = data?.id ?? null;
      }
    }
    startSession();
    return () => {
      if (sessionId) {
        supabase.from("listener_sessions").update({
          ended_at: new Date().toISOString(),
        }).eq("id", sessionId).then(() => {});
      }
    };
  }, [slug, supabase]);

  function formatTimecode(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  const progress = metadata.duration > 0 ? Math.min((stream.elapsed / metadata.duration) * 100, 100) : 0;
  const profile = channel?.profile as any;
  const effectiveVolume = stream.isMuted ? 0 : stream.volume;

  // Ruler scaling: ensure ~20px per second so sub-second ticks stay visible
  const rulerPxPerSec = 20;
  const rulerContainerW = typeof window !== "undefined" ? Math.min(window.innerWidth, 460) : 460;
  const rulerWidthPct = Math.max(200, ((metadata.duration || 1) * rulerPxPerSec / rulerContainerW) * 100);
  // Playhead at center: translate so 0% progress = start at center
  const rulerTranslateOrigin = (50 / rulerWidthPct) * 100; // equivalent of 50% container in ruler %

  if (!channel) {
    return (
      <div style={{
        height: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        backgroundColor: "var(--bg-base)",
      }}>
        <InlineLoader />
      </div>
    );
  }

  const nextTrack = metadata.upcoming[0];

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100vh - 65px)",
      marginTop: "-24px",
      marginLeft: "-20px",
      marginRight: "-20px",
      backgroundColor: "var(--bg-base)",
      color: "var(--text-primary)",
      fontFamily: "'JetBrains Mono', monospace",
      overflow: "hidden",
      WebkitFontSmoothing: "antialiased",
    }}>

      <style>{`
        .scanlines {
          background: linear-gradient(
            to bottom,
            rgba(255, 255, 255, 0),
            rgba(255, 255, 255, 0) 50%,
            rgba(0, 0, 0, 0.2) 50%,
            rgba(0, 0, 0, 0.2)
          );
          background-size: 100% 4px;
        }
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cursor-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
        .glow-text {
          text-shadow: 0 0 10px rgba(245, 158, 11, 0.5);
        }
        @keyframes neon-bounce {
          0%, 100% {
            transform: translateY(0);
            text-shadow:
              0 0 7px rgba(120, 179, 206, 0.7),
              0 0 20px rgba(120, 179, 206, 0.5),
              0 0 40px rgba(120, 179, 206, 0.3);
          }
          50% {
            transform: translateY(-4px);
            text-shadow:
              0 0 10px rgba(120, 179, 206, 0.9),
              0 0 30px rgba(120, 179, 206, 0.7),
              0 0 60px rgba(120, 179, 206, 0.4),
              0 0 80px rgba(120, 179, 206, 0.2);
          }
        }
        .neon-title {
          animation: neon-bounce 2s ease-in-out infinite;
          color: var(--accent-blue) !important;
        }
      `}</style>

      {/* Scanline overlay */}
      <div className="scanlines" style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 50,
        mixBlendMode: "overlay",
        opacity: 0.5,
      }} />

      {/* ── Header ── */}
      <header style={{
        padding: "24px 20px",
        borderBottom: "2px solid #27272a",
        backgroundColor: "#202020",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        flexShrink: 0,
      }}>
        {/* System status bar */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: channel.is_live ? "rgba(245, 158, 11, 0.8)" : "#52525b",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            {/* Back arrow */}
            <button
              onClick={() => router.push("/listen")}
              style={{
                background: "none", border: "none",
                color: "#f59e0b",
                cursor: "pointer", fontFamily: "inherit",
                fontSize: "12px",
                display: "flex", alignItems: "center", gap: "6px",
                padding: 0,
              }}
            >
              <span>&lt;</span>
            </button>
            {channel.is_live && (
              <span style={{
                width: "6px", height: "6px",
                borderRadius: "50%",
                backgroundColor: "#f59e0b",
                boxShadow: "0 0 6px rgba(245, 158, 11, 0.8)",
                display: "inline-block",
              }} />
            )}
            <span>{channel.is_live ? "SIGNAL LOCKED" : "STANDBY"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <span style={{
              display: "flex", alignItems: "center", gap: "5px",
              fontSize: "10px", letterSpacing: "0.05em",
              color: channel.is_live ? "rgba(245, 158, 11, 0.7)" : "#52525b",
            }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
              {(channel.monthly_listeners || 0).toLocaleString()}
            </span>
            <span style={{
              padding: "2px 6px", fontSize: "10px",
              textTransform: "uppercase", borderRadius: "2px",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            }}>[ FLAC ]</span>
          </div>
        </div>

        {/* Channel title + heart + follow */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <h1 className="neon-title" style={{
            fontSize: "30px",
            fontWeight: 800,
            letterSpacing: "-0.05em",
            textTransform: "uppercase",
            lineHeight: 1,
            display: "inline-block",
            flex: 1,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {channel.channel_name}
          </h1>
          <button
            onClick={toggleFavorite}
            aria-label={isFavorited ? "Remove from favorites" : "Add to favorites"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            {heartAnimating ? (
              <Lottie
                lottieRef={heartRef}
                animationData={heartAnimation}
                autoplay={false}
                loop={false}
                style={{ width: 28, height: 28 }}
              />
            ) : isFavorited ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#f59e0b" stroke="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              <Lottie
                lottieRef={heartRef}
                animationData={heartAnimation}
                autoplay={false}
                loop={false}
                style={{ width: 28, height: 28 }}
              />
            )}
          </button>
          {currentUserId && broadcasterId && currentUserId !== broadcasterId && (
            <button
              onClick={toggleFollow}
              disabled={togglingFollow}
              style={{
                padding: "6px 14px",
                backgroundColor: isFollowing ? "transparent" : "#f59e0b",
                color: isFollowing ? "#f59e0b" : "#0a0a0a",
                border: "1px solid #f59e0b",
                borderRadius: "0px",
                fontSize: "10px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: togglingFollow ? "not-allowed" : "pointer",
                fontFamily: "'JetBrains Mono', monospace",
                flexShrink: 0,
                opacity: togglingFollow ? 0.6 : 1,
                transition: "all 0.15s",
              }}
            >
              {isFollowing ? "Following" : "Follow"}
            </button>
          )}
        </div>

        {/* Channel name */}
        <div style={{
          fontSize: "13px",
          color: channel.is_live ? "#d4d4d8" : "#71717a",
          marginTop: "6px",
          fontWeight: 500,
        }}>
          HOST: {profile?.display_name || "Unknown"}
        </div>
        {channel.genre?.length ? (
          <div style={{
            fontSize: "11px",
            color: channel.is_live ? "#a1a1aa" : "#52525b",
            marginTop: "2px",
          }}>
            GEN: {channel.genre.slice(0, 3).join(" / ").toUpperCase()}
          </div>
        ) : null}
      </header>

      {/* ── Main Stage ── */}
      <main style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-well)",
        position: "relative",
        overflow: "hidden",
      }}>
        {/* Track metadata */}
        <div style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          zIndex: 10,
        }}>
          <div style={{
            fontSize: "12px",
            fontWeight: 700,
            color: "rgba(245, 158, 11, 0.8)",
            textTransform: "uppercase",
            marginBottom: "8px",
            letterSpacing: "0.1em",
          }}>
            {metadata.track ? "NOW_PLAYING" : "AWAITING_SIGNAL"}
          </div>
          <h2 className={metadata.track ? "glow-text" : ""} style={{
            fontSize: "20px",
            fontWeight: 700,
            letterSpacing: "-0.02em",
            color: metadata.track ? "#fbbf24" : "#a1a1aa",
            textTransform: "uppercase",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            {metadata.track?.title.replace(/\s+/g, "_") || "—"}
          </h2>
          <h3 style={{
            fontSize: "13px",
            fontWeight: 500,
            color: metadata.track ? "#d4d4d8" : "#71717a",
            marginTop: "4px",
          }}>
            HOST: {metadata.track?.artist || profile?.display_name || "Unknown"}
          </h3>
        </div>

        {/* Upcoming block */}
        {nextTrack && (
          <div style={{
            margin: "0 20px 20px",
            padding: "12px 16px",
            backgroundColor: "rgba(24, 24, 27, 0.8)",
            borderLeft: "4px solid #f59e0b",
            fontSize: "11px",
            lineHeight: 1.5,
            color: "#a1a1aa",
            alignSelf: "flex-start",
            zIndex: 10,
            maxWidth: "80%",
            boxShadow: "inset 0 0 20px rgba(245, 158, 11, 0.05), 0 0 15px rgba(245, 158, 11, 0.1)",
          }}>
            <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", marginBottom: "4px" }}>
              QUEUE
            </div>
            <span style={{ color: "#fbbf24", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.02em" }}>
              {nextTrack.title.replace(/\s+/g, "_")}
            </span>
            {nextTrack.artist && <span style={{ color: "#71717a" }}> — {nextTrack.artist}</span>}
          </div>
        )}

        {/* Visualizer (positioned absolute at bottom) */}
        <div style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "60%",
          opacity: 0.8,
          pointerEvents: "none",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
        }}>
          <Visualizer analyserNode={stream.analyserNode} isPlaying={stream.isPlaying} />
        </div>
      </main>

      {/* ── Control Deck ── */}
      <footer style={{
        backgroundColor: "#2B2B2B",
        borderTop: "2px solid #27272a",
        paddingBottom: "env(safe-area-inset-bottom, 20px)",
        flexShrink: 0,
      }}>
        {/* Timeline section */}
        <div style={{
          padding: "24px 0 16px 0",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}>
          {/* Timecode display */}
          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontSize: "16px",
            fontWeight: 700,
            color: "#71717a",
            marginBottom: "24px",
            letterSpacing: "0.05em",
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="#f59e0b">
              <path d="M6 4l15 8-15 8z" />
            </svg>
            <span style={{ color: "#fbbf24" }}>
              {formatTimecode(stream.elapsed)}
            </span>
            <span style={{ color: "#52525b" }}>
              / {formatTimecode(metadata.duration)}
            </span>
          </div>

          {/* Sliding timeline with fixed center playhead */}
          <div style={{
            width: "100%",
            height: "44px",
            position: "relative",
            overflow: "hidden",
          }}>
            {/* Sliding ruler — moves right-to-left as time progresses */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: `${rulerWidthPct}%`,
              height: "100%",
              transform: `translateX(calc(${rulerTranslateOrigin}% - ${progress}%))`,
              transition: "transform 1s linear",
            }}>
              {/* Generate tick marks: minutes with second numbers, sub-ticks between seconds */}
              {(() => {
                const dur = metadata.duration || 1;
                const totalWidth = rulerWidthPct;
                const ticks: React.ReactNode[] = [];

                // 4 sub-ticks between each second (every 250ms)
                const step = 0.25;
                const totalSteps = Math.ceil(dur / step);

                for (let i = 0; i <= totalSteps; i++) {
                  const t = i * step;
                  if (t > dur) break;

                  const posPercent = (t / dur) * totalWidth;
                  const isWholeSecond = Math.abs(t - Math.round(t)) < 0.01;
                  const sec = Math.round(t);
                  const isMinute = isWholeSecond && sec % 60 === 0;

                  let height: number;
                  let color: string;
                  let showLabel = false;
                  let labelText = "";

                  if (isMinute) {
                    height = 18;
                    color = "#f59e0b";
                    showLabel = true;
                    const m = Math.floor(sec / 60);
                    labelText = `${m}:00`;
                  } else if (isWholeSecond) {
                    height = 10;
                    color = "#52525b";
                    showLabel = true;
                    const s = sec % 60;
                    labelText = String(s);
                  } else {
                    // Sub-second tick (250ms intervals)
                    height = 6;
                    color = "#52525b";
                  }

                  ticks.push(
                    <div key={t} style={{
                      position: "absolute",
                      left: `${posPercent}%`,
                      bottom: 0,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      transform: "translateX(-50%)",
                    }}>
                      {showLabel && (
                        <span style={{
                          fontSize: isMinute ? "10px" : "7px",
                          color: isMinute ? "#f59e0b" : "#3f3f46",
                          marginBottom: isMinute ? "2px" : "1px",
                          whiteSpace: "nowrap",
                          fontFamily: "var(--font-mono)",
                          fontWeight: isMinute ? 700 : 500,
                        }}>{labelText}</span>
                      )}
                      <div style={{
                        width: isWholeSecond ? "1px" : "1px",
                        height: `${height}px`,
                        backgroundColor: color,
                        opacity: isWholeSecond ? 1 : 0.8,
                      }} />
                    </div>
                  );
                }
                return ticks;
              })()}
            </div>

            {/* Fixed center playhead */}
            <div style={{
              position: "absolute",
              top: 0,
              left: "50%",
              width: "2px",
              height: "100%",
              backgroundColor: "#f59e0b",
              transform: "translateX(-50%)",
              zIndex: 20,
              boxShadow: "0 0 8px rgba(245, 158, 11, 0.8)",
            }}>
              {/* Playhead triangle */}
              <div style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "6px solid #f59e0b",
              }} />
            </div>

            {/* Fade edges */}
            <div style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "40px",
              height: "100%",
              background: "linear-gradient(to right, #2B2B2B, transparent)",
              zIndex: 10,
              pointerEvents: "none",
            }} />
            <div style={{
              position: "absolute",
              top: 0,
              right: 0,
              width: "40px",
              height: "100%",
              background: "linear-gradient(to left, #2B2B2B, transparent)",
              zIndex: 10,
              pointerEvents: "none",
            }} />
          </div>
        </div>

        {/* Transport controls */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 32px 24px",
        }}>
          {/* Left: Volume */}
          <button
            onClick={stream.toggleMute}
            style={{
              background: "none", border: "none", padding: "12px",
              cursor: "pointer", color: effectiveVolume === 0 ? "#52525b" : "#71717a",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.2s",
            }}
          >
            {effectiveVolume === 0 ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>

          {/* Center: Transport */}
          <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
            {/* Previous Channel */}
            <button
              onClick={() => canNavigate && router.push(`/listen/${prevSlug}`)}
              disabled={!canNavigate}
              style={{
                background: "none", border: "none", padding: "12px",
                cursor: canNavigate ? "pointer" : "default",
                color: canNavigate ? "#71717a" : "#3f3f46",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.2s",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="19 20 9 12 19 4 19 20" />
                <line x1="5" y1="19" x2="5" y2="5" />
              </svg>
            </button>

            {/* Play / Pause */}
            <button
              onClick={stream.toggle}
              disabled={metadata.ended}
              style={{
                background: "none", border: "none", padding: "12px",
                cursor: metadata.ended ? "default" : "pointer",
                color: metadata.ended ? "#3f3f46" : "#71717a",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.2s",
                opacity: metadata.ended ? 0.3 : 1,
              }}
            >
              {stream.isPlaying ? (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </svg>
              ) : (
                <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M6 4l15 8-15 8z" />
                </svg>
              )}
            </button>

            {/* Next Channel */}
            <button
              onClick={() => canNavigate && router.push(`/listen/${nextSlug}`)}
              disabled={!canNavigate}
              style={{
                background: "none", border: "none", padding: "12px",
                cursor: canNavigate ? "pointer" : "default",
                color: canNavigate ? "#71717a" : "#3f3f46",
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "color 0.2s",
              }}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 4 15 12 5 20 5 4" />
                <line x1="19" y1="5" x2="19" y2="19" />
              </svg>
            </button>
          </div>

          {/* Right: Share channel link */}
          <button
            onClick={async () => {
              const shareUrl = `${window.location.origin}/listen/${slug}`;
              const shareData = {
                title: `${channel.channel_name} on Radio1`,
                text: `Listen to ${channel.channel_name} on Radio1`,
                url: shareUrl,
              };
              if (navigator.share && navigator.canShare?.(shareData)) {
                try { await navigator.share(shareData); } catch { /* user cancelled */ }
              } else {
                await navigator.clipboard.writeText(shareUrl);
                setShowShareToast(true);
                setTimeout(() => setShowShareToast(false), 2000);
              }
            }}
            style={{
              background: "none", border: "none", padding: "12px",
              cursor: "pointer", color: "#71717a",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "color 0.2s",
              position: "relative",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
            {showShareToast && (
              <span style={{
                position: "absolute",
                bottom: "100%",
                right: 0,
                backgroundColor: "#f59e0b",
                color: "#0a0a0a",
                fontSize: "10px",
                fontWeight: 700,
                padding: "4px 8px",
                whiteSpace: "nowrap",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
              }}>Link copied</span>
            )}
          </button>
        </div>

        {/* Volume slider row */}
        <div style={{
          padding: "0 32px 8px",
          display: "flex",
          alignItems: "center",
          gap: "12px",
        }}>
          <style>{`
            .timeline-vol-slider {
              -webkit-appearance: none; appearance: none;
              flex: 1; height: 3px; border-radius: 1px;
              background: #27272a; outline: none; cursor: pointer;
            }
            .timeline-vol-slider::-webkit-slider-thumb {
              -webkit-appearance: none; width: 12px; height: 12px;
              border-radius: 50%; background: #f59e0b; cursor: pointer;
              box-shadow: 0 0 6px rgba(245, 158, 11, 0.8);
            }
          `}</style>
          <span style={{
            fontSize: "10px",
            color: "#52525b", letterSpacing: "0.5px",
            textTransform: "uppercase", minWidth: "28px",
          }}>
            VOL
          </span>
          <input
            type="range"
            className="timeline-vol-slider"
            min="0" max="1" step="0.05"
            value={effectiveVolume}
            onChange={(e) => stream.changeVolume(parseFloat(e.target.value))}
          />
          <span style={{
            fontSize: "10px",
            color: "#52525b", minWidth: "28px", textAlign: "right",
          }}>
            {Math.round(effectiveVolume * 100)}%
          </span>
        </div>

        {/* Status footer */}
        <div style={{
          padding: "12px 32px",
          borderTop: "2px solid #27272a",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          color: "#71717a",
          fontWeight: 500,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div className="cursor-blink" style={{
                width: "10px", height: "10px",
                border: "2px solid #f59e0b",
                borderRadius: "2px",
                position: "absolute",
              }} />
              <div style={{
                width: "4px", height: "4px",
                backgroundColor: "#f59e0b",
                borderRadius: "2px",
              }} />
            </div>
            <span style={{ letterSpacing: "0.1em" }}>
              {stream.isPlaying ? "RECEIVING..." : "STANDBY"}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ color: "#52525b" }}>/{channel.channel_slug}</span>
            <span style={{
              backgroundColor: "#18181b",
              padding: "4px 8px",
              borderRadius: "4px",
              fontSize: "10px",
              letterSpacing: "0.05em",
            }}>SYS.OK</span>
          </div>
        </div>
      </footer>

      <audio ref={stream.audioRef} crossOrigin="anonymous" />
    </div>
  );
}

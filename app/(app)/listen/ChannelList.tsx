"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Channel {
  id: string;
  channel_name: string;
  channel_slug: string;
  genre: string[] | null;
  is_live: boolean;
  monthly_listeners: number;
  profile: { display_name: string; bio: string | null };
}

export default function ChannelList({
  allChannels,
  likeMap,
  followedIds,
  followerMap,
}: {
  allChannels: Channel[];
  likeMap: Record<string, number>;
  followedIds: string[];
  followerMap: Record<string, number>;
}) {
  const supabase = createClient();
  const [tab, setTab] = useState<"all" | "following">("all");
  const [channels, setChannels] = useState<Channel[]>(allChannels);
  const [nowPlayingMap, setNowPlayingMap] = useState<Record<string, { title: string; type?: string }>>({});

  // Poll channel live status every 5 seconds
  useEffect(() => {
    async function refreshChannels() {
      const ids = allChannels.map((ch) => ch.id);
      if (ids.length === 0) return;
      const { data } = await supabase
        .from("broadcaster_profiles")
        .select("id, is_live")
        .in("id", ids);
      if (data) {
        const liveMap = new Map(data.map((d) => [d.id, d.is_live]));
        setChannels((prev) => {
          const updated = prev.map((ch) => ({
            ...ch,
            is_live: liveMap.get(ch.id) ?? ch.is_live,
          }));
          // Sort: live channels first
          updated.sort((a, b) => (a.is_live === b.is_live ? 0 : a.is_live ? -1 : 1));
          return updated;
        });
      }
    }
    refreshChannels();
    const interval = setInterval(refreshChannels, 5000);
    return () => clearInterval(interval);
  }, [allChannels, supabase]);

  // Poll now-playing for live channels
  useEffect(() => {
    const liveSlugs = channels.filter((ch) => ch.is_live).map((ch) => ch.channel_slug);

    const origin = typeof window !== "undefined" ? window.location.origin : "";

    async function poll() {
      // Clear stale entries for channels no longer live
      setNowPlayingMap((prev) => {
        const next = { ...prev };
        for (const slug of Object.keys(next)) {
          if (!liveSlugs.includes(slug)) delete next[slug];
        }
        return next;
      });

      for (const slug of liveSlugs) {
        try {
          const res = await fetch(`${origin}/metadata/api/channels/${slug}/now-playing`);
          if (res.ok) {
            const data = await res.json();
            if (data.track && !data.ended) {
              setNowPlayingMap((prev) => ({ ...prev, [slug]: { title: data.track.title, type: data.type } }));
            } else {
              setNowPlayingMap((prev) => {
                const next = { ...prev };
                delete next[slug];
                return next;
              });
            }
          }
        } catch { /* ignore */ }
      }
    }

    poll();
    const interval = setInterval(poll, 3000);
    return () => clearInterval(interval);
  }, [channels]);

  const followedSet = new Set(followedIds);
  const displayChannels = tab === "following"
    ? channels.filter((ch) => followedSet.has(ch.id))
    : channels;

  return (
    <div style={{
      maxWidth: "460px",
      margin: "0 auto",
      padding: "0",
      fontFamily: "'JetBrains Mono', monospace",
      position: "relative",
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
        .glow-box {
          box-shadow: inset 0 0 20px rgba(245, 158, 11, 0.05), 0 0 15px rgba(245, 158, 11, 0.1);
        }
        .signal-glow {
          box-shadow: 0 0 6px rgba(245, 158, 11, 0.8);
        }
        @keyframes pulse-glow {
          0%, 100% { box-shadow: 0 0 6px rgba(245, 158, 11, 0.8); }
          50% { box-shadow: 0 0 12px rgba(245, 158, 11, 1), 0 0 20px rgba(245, 158, 11, 0.4); }
        }
        @keyframes live-border-pulse {
          0%, 100% { border-left-color: #f59e0b; }
          50% { border-left-color: #fbbf24; }
        }
        @keyframes live-dot-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 6px rgba(245, 158, 11, 0.8); }
          50% { opacity: 0.5; box-shadow: 0 0 12px rgba(245, 158, 11, 1); }
        }
        .live-card {
          animation: live-border-pulse 2s ease-in-out infinite;
          transition: background-color 0.15s;
        }
        .live-card:hover {
          background-color: rgba(24, 24, 27, 0.95) !important;
        }
        .live-dot {
          animation: live-dot-pulse 1.5s ease-in-out infinite;
        }
        .signal-bar-active {
          animation: pulse-glow 2s ease-in-out infinite;
        }
        .channel-card {
          transition: background-color 0.15s;
        }
        .channel-card:hover {
          background-color: rgba(24, 24, 27, 0.5);
        }
        .channel-card:hover .ch-label {
          color: #a1a1aa;
        }
        .channel-card:hover .ch-name {
          color: #e4e4e7;
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

      {/* Header */}
      <header style={{ marginBottom: "24px" }}>
        <div style={{
          color: "#f59e0b",
          fontSize: "12px",
          fontWeight: 500,
          letterSpacing: "0.05em",
          opacity: 0.9,
          display: "flex",
          alignItems: "center",
          gap: "8px",
        }}>
          <span>&gt;</span>
          <span>sys_run( &quot;list_channels --active&quot; )</span>
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>

        <div style={{
          borderBottom: "2px solid #27272a",
          paddingBottom: "16px",
          marginTop: "12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}>
          <h1 style={{
            fontSize: "30px",
            fontWeight: 800,
            color: "#ffffff",
            letterSpacing: "-0.05em",
            textTransform: "uppercase",
            lineHeight: 1,
          }}>
            Data<br />Stream<span style={{ color: "#f59e0b" }}>_</span>
          </h1>
          <div style={{
            fontSize: "10px",
            color: "#52525b",
            textAlign: "right",
            lineHeight: 1.4,
          }}>
            <div>UPLINK: SECURE</div>
            <div>NODE: 89.X.4</div>
          </div>
        </div>

        {/* Tab buttons */}
        <div style={{
          display: "flex",
          gap: "0px",
          marginTop: "16px",
        }}>
          <button
            onClick={() => setTab("all")}
            style={{
              flex: 1,
              padding: "10px",
              backgroundColor: tab === "all" ? "rgba(245, 158, 11, 0.1)" : "transparent",
              border: "1px solid",
              borderColor: tab === "all" ? "#f59e0b" : "#27272a",
              borderRight: "none",
              color: tab === "all" ? "#f59e0b" : "#52525b",
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s",
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            All Channels
            <span style={{
              fontSize: "9px",
              backgroundColor: tab === "all" ? "rgba(245, 158, 11, 0.2)" : "#27272a",
              padding: "1px 5px",
              color: tab === "all" ? "#f59e0b" : "#71717a",
            }}>{channels.length}</span>
          </button>
          <button
            onClick={() => setTab("following")}
            style={{
              flex: 1,
              padding: "10px",
              backgroundColor: tab === "following" ? "rgba(245, 158, 11, 0.1)" : "transparent",
              border: "1px solid",
              borderColor: tab === "following" ? "#f59e0b" : "#27272a",
              color: tab === "following" ? "#f59e0b" : "#52525b",
              fontSize: "10px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.1em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
              transition: "all 0.15s",
            }}
          >
            Following
            {followedIds.length > 0 && (
              <span style={{
                fontSize: "9px",
                backgroundColor: tab === "following" ? "rgba(245, 158, 11, 0.2)" : "#27272a",
                padding: "1px 5px",
                color: tab === "following" ? "#f59e0b" : "#71717a",
              }}>{followedIds.length}</span>
            )}
          </button>
        </div>
      </header>

      {/* Channel List */}
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        {displayChannels.length === 0 ? (
          <div style={{
            padding: "40px 20px",
            textAlign: "center",
            borderLeft: "2px solid #27272a",
            backgroundColor: "rgba(24, 24, 27, 0.3)",
          }}>
            <div style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
              {tab === "following" ? "NO FOLLOWED CHANNELS" : "NO CHANNELS DETECTED"}
            </div>
            <div style={{ color: "#3f3f46", fontSize: "10px", marginTop: "8px" }}>
              {tab === "following" ? (
                <>Use <a href="/search" style={{ color: "#f59e0b", textDecoration: "none" }}>Search</a> to find and follow broadcasters</>
              ) : (
                "Awaiting broadcaster uplink..."
              )}
            </div>
          </div>
        ) : (
          displayChannels.map((ch, index) => (
            <ChannelCard key={ch.id} channel={ch} index={index} likes={likeMap[ch.channel_slug] || 0} followers={followerMap[ch.id] || 0} nowPlaying={nowPlayingMap[ch.channel_slug] || null} />
          ))
        )}
      </div>

      {/* Footer */}
      <footer style={{
        marginTop: "24px",
        paddingTop: "16px",
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
              width: "10px",
              height: "10px",
              border: "2px solid #f59e0b",
              borderRadius: "2px",
              position: "absolute",
            }} />
            <div style={{
              width: "4px",
              height: "4px",
              backgroundColor: "#f59e0b",
              borderRadius: "2px",
            }} />
          </div>
          <span style={{ letterSpacing: "0.1em" }}>SCANNING...</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <span style={{ color: "#52525b" }}>SYS.OK</span>
          <span style={{
            backgroundColor: "#18181b",
            padding: "4px 8px",
            borderRadius: "4px",
            fontSize: "10px",
            letterSpacing: "0.05em",
          }}>VER: 2.4.1-STABLE</span>
        </div>
      </footer>
    </div>
  );
}

function ChannelCard({ channel, index, likes, followers, nowPlaying }: { channel: any; index: number; likes: number; followers: number; nowPlaying: { title: string; type?: string } | null }) {
  const router = useRouter();
  const isLive = channel.is_live;
  const profile = channel.profile as any;
  const chNum = String(index + 1).padStart(2, "0");

  // Signal strength based on listeners
  const listeners = channel.monthly_listeners || 0;
  const signalBars = listeners > 100 ? 4 : listeners > 50 ? 3 : listeners > 10 ? 2 : 1;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${channel.channel_name}`}
      onClick={() => router.push(`/listen/${channel.channel_slug}`)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          router.push(`/listen/${channel.channel_slug}`);
        }
      }}
      style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
    >
      <div
        className={isLive ? "live-card" : "channel-card"}
        style={{
          position: "relative",
          borderLeft: isLive ? "4px solid #f59e0b" : "2px solid #27272a",
          backgroundColor: isLive ? "rgba(24, 24, 27, 0.8)" : "rgba(24, 24, 27, 0.3)",
          padding: "16px",
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          ...(isLive ? {
            boxShadow: "inset 0 0 20px rgba(245, 158, 11, 0.05), 0 0 15px rgba(245, 158, 11, 0.1)",
          } : {}),
        }}
      >
        {/* Corner decorations for live channel */}
        {isLive && (
          <>
            <div style={{
              position: "absolute", top: 0, right: 0,
              width: "8px", height: "8px",
              borderTop: "1px solid rgba(245, 158, 11, 0.5)",
              borderRight: "1px solid rgba(245, 158, 11, 0.5)",
              margin: "4px",
            }} />
            <div style={{
              position: "absolute", bottom: 0, right: 0,
              width: "8px", height: "8px",
              borderBottom: "1px solid rgba(245, 158, 11, 0.5)",
              borderRight: "1px solid rgba(245, 158, 11, 0.5)",
              margin: "4px",
            }} />
          </>
        )}

        {/* Top row: channel number + format */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "12px",
          fontWeight: 700,
          letterSpacing: "0.1em",
          color: isLive ? "rgba(245, 158, 11, 0.8)" : "#52525b",
        }}>
          <span className="ch-label">CH_{chNum}</span>
          <span style={{
            padding: "2px 6px",
            fontSize: "10px",
            textTransform: "uppercase",
            borderRadius: "2px",
            ...(isLive ? {
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              color: "#f59e0b",
              border: "1px solid rgba(245, 158, 11, 0.2)",
            } : {
              border: "1px solid #27272a",
              color: "#71717a",
            }),
          }}>[ FLAC ]</span>
        </div>

        {/* Channel name + host */}
        <div>
          <div
            className={isLive ? "glow-text" : "ch-name"}
            style={{
              fontSize: isLive ? "20px" : "18px",
              fontWeight: 700,
              color: isLive ? "#fbbf24" : "#a1a1aa",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
            }}
          >
            {channel.channel_name.replace(/\s+/g, "_")}
          </div>
          <div style={{
            fontSize: "13px",
            color: isLive ? "#d4d4d8" : "#71717a",
            marginTop: "6px",
            fontWeight: 500,
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <span style={{ fontSize: "11px" }}>HOST:</span>
            <a
              href={`/listen/profile/${channel.channel_slug}`}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              style={{
                fontSize: "10px",
                color: "#f59e0b",
                textTransform: "uppercase",
                padding: "2px 6px",
                backgroundColor: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.2)",
                borderRadius: "2px",
                fontWeight: 700,
                letterSpacing: "0.1em",
                textDecoration: "none",
                fontFamily: "var(--font-mono)",
              }}
            >
              {profile?.display_name || "Unknown"}
            </a>
          </div>
          {channel.genre?.length > 0 && (
            <div style={{
              fontSize: "11px",
              color: isLive ? "#a1a1aa" : "#52525b",
              marginTop: "2px",
            }}>
              GEN: {channel.genre.slice(0, 3).join(" / ").toUpperCase()}
            </div>
          )}
          {isLive && nowPlaying && (
            <div style={{
              fontSize: "11px",
              color: "#fbbf24",
              marginTop: "6px",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              overflow: "hidden",
            }}>
              <span style={{
                width: "4px",
                height: "4px",
                borderRadius: "50%",
                backgroundColor: "#f59e0b",
                flexShrink: 0,
                animation: "live-dot-pulse 1.5s ease-in-out infinite",
              }} />
              {nowPlaying.type !== "host_segment" && (
                <span style={{
                  fontSize: "10px",
                  color: "#52525b",
                  letterSpacing: "0.05em",
                  flexShrink: 0,
                }}>
                  NOW:
                </span>
              )}
              <span style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                fontWeight: 600,
                letterSpacing: "-0.02em",
                color: nowPlaying.type === "host_segment" ? "#d4d4d8" : "#fbbf24",
              }}>
                {nowPlaying.type === "host_segment" ? nowPlaying.title : nowPlaying.title.replace(/\s+/g, "_").toUpperCase()}
              </span>
            </div>
          )}
        </div>

        {/* Bottom row: status + signal bars */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginTop: "4px",
          paddingTop: "12px",
          borderTop: isLive ? "1px solid rgba(39, 39, 42, 0.5)" : "1px solid rgba(39, 39, 42, 0.3)",
        }}>
          <span style={{
            fontSize: "10px",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            display: "flex",
            alignItems: "center",
            gap: "6px",
            color: isLive ? "rgba(245, 158, 11, 0.8)" : "#52525b",
          }}>
            {isLive && (
              <span className="live-dot" style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: "#f59e0b",
              }} />
            )}
            {isLive ? "Connected" : "Standby"}
          </span>

          {/* Likes count */}
          <span style={{
            fontSize: "10px",
            letterSpacing: "0.05em",
            color: isLive ? "rgba(245, 158, 11, 0.7)" : "#52525b",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill={likes > 0 ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            {likes.toLocaleString()}
          </span>

          {/* Follower count */}
          <span style={{
            fontSize: "10px",
            letterSpacing: "0.05em",
            color: isLive ? "rgba(245, 158, 11, 0.7)" : "#52525b",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            {followers.toLocaleString()}
          </span>

          {/* Signal bars */}
          <div style={{ display: "flex", gap: "6px" }}>
            {[1, 2, 3, 4].map((bar) => (
              <div key={bar} className={isLive && bar <= signalBars ? "signal-bar-active" : ""} style={{
                width: "10px",
                height: "10px",
                backgroundColor: isLive
                  ? (bar <= signalBars ? "#f59e0b" : "#27272a")
                  : (bar <= signalBars ? "#71717a" : "#27272a"),
              }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

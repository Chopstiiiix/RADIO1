"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface ListenerProfile {
  id: string;
  display_name: string;
  avatar_url: string | null;
  role: string;
}

interface ActiveListener extends ListenerProfile {
  started_at: string;
}

interface Follower extends ListenerProfile {
  followed_at: string;
}

export default function ListenersPage() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"active" | "followers">("active");
  const [activeListeners, setActiveListeners] = useState<ActiveListener[]>([]);
  const [followers, setFollowers] = useState<Follower[]>([]);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Active listeners (sessions without ended_at)
      const { data: sessions } = await supabase
        .from("listener_sessions")
        .select("listener_id, started_at")
        .eq("broadcaster_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false });

      if (sessions && sessions.length > 0) {
        const listenerIds = [...new Set(sessions.map((s) => s.listener_id).filter(Boolean))];
        if (listenerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, role")
            .in("id", listenerIds);

          const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
          setActiveListeners(
            sessions
              .filter((s) => s.listener_id && profileMap.has(s.listener_id))
              .map((s) => ({
                ...profileMap.get(s.listener_id)!,
                started_at: s.started_at,
              }))
          );
        }
      }

      // Followers
      const { data: followData } = await supabase
        .from("follows")
        .select("follower_id, created_at")
        .eq("broadcaster_id", user.id)
        .order("created_at", { ascending: false });

      if (followData && followData.length > 0) {
        const followerIds = followData.map((f) => f.follower_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, display_name, avatar_url, role")
          .in("id", followerIds);

        const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
        setFollowers(
          followData
            .filter((f) => profileMap.has(f.follower_id))
            .map((f) => ({
              ...profileMap.get(f.follower_id)!,
              followed_at: f.created_at,
            }))
        );
      }

      setLoading(false);
    }
    load();
  }, [supabase]);

  // Poll active listeners every 10s
  useEffect(() => {
    const interval = setInterval(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: sessions } = await supabase
        .from("listener_sessions")
        .select("listener_id, started_at")
        .eq("broadcaster_id", user.id)
        .is("ended_at", null)
        .order("started_at", { ascending: false });

      if (sessions && sessions.length > 0) {
        const listenerIds = [...new Set(sessions.map((s) => s.listener_id).filter(Boolean))];
        if (listenerIds.length > 0) {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, display_name, avatar_url, role")
            .in("id", listenerIds);

          const profileMap = new Map((profiles || []).map((p) => [p.id, p]));
          setActiveListeners(
            sessions
              .filter((s) => s.listener_id && profileMap.has(s.listener_id))
              .map((s) => ({
                ...profileMap.get(s.listener_id)!,
                started_at: s.started_at,
              }))
          );
        }
      } else {
        setActiveListeners([]);
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [supabase]);

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  if (loading) return <InlineLoader />;

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
      `}</style>

      {/* Terminal header */}
      <div style={{ marginBottom: "8px" }}>
        <span style={{ color: "#f59e0b", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
          {">"} broadcast --listeners
        </span>
        <span className="cursor-blink" style={{
          width: "8px", height: "12px", backgroundColor: "#f59e0b", display: "inline-block",
        }} />
      </div>

      <h1 style={{
        fontSize: "24px", fontWeight: 700, textTransform: "uppercase",
        letterSpacing: "-0.05em", marginBottom: "24px",
      }}>
        Listeners<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      {/* Tabs */}
      <div style={{ display: "flex", gap: "0px", marginBottom: "16px" }}>
        <button
          onClick={() => setTab("active")}
          style={{
            flex: 1, padding: "10px",
            backgroundColor: tab === "active" ? "rgba(245, 158, 11, 0.1)" : "transparent",
            border: "1px solid", borderRight: "none",
            borderColor: tab === "active" ? "#f59e0b" : "#27272a",
            color: tab === "active" ? "#f59e0b" : "#52525b",
            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", cursor: "pointer",
            fontFamily: "var(--font-mono)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          <span style={{
            width: "6px", height: "6px", borderRadius: "50%",
            backgroundColor: tab === "active" ? "#4ADE80" : "#3f3f46",
          }} />
          Live Now
          <span style={{
            fontSize: "9px",
            backgroundColor: tab === "active" ? "rgba(245, 158, 11, 0.2)" : "#27272a",
            padding: "1px 5px",
            color: tab === "active" ? "#f59e0b" : "#71717a",
          }}>{activeListeners.length}</span>
        </button>
        <button
          onClick={() => setTab("followers")}
          style={{
            flex: 1, padding: "10px",
            backgroundColor: tab === "followers" ? "rgba(245, 158, 11, 0.1)" : "transparent",
            border: "1px solid",
            borderColor: tab === "followers" ? "#f59e0b" : "#27272a",
            color: tab === "followers" ? "#f59e0b" : "#52525b",
            fontSize: "10px", fontWeight: 700, textTransform: "uppercase",
            letterSpacing: "0.1em", cursor: "pointer",
            fontFamily: "var(--font-mono)",
            display: "flex", alignItems: "center", justifyContent: "center", gap: "6px",
          }}
        >
          Followers
          <span style={{
            fontSize: "9px",
            backgroundColor: tab === "followers" ? "rgba(245, 158, 11, 0.2)" : "#27272a",
            padding: "1px 5px",
            color: tab === "followers" ? "#f59e0b" : "#71717a",
          }}>{followers.length}</span>
        </button>
      </div>

      {/* Active Listeners */}
      {tab === "active" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {activeListeners.length === 0 ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "2px solid #27272a",
            }}>
              <div style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                NO ACTIVE LISTENERS
              </div>
              <div style={{ color: "#3f3f46", fontSize: "10px", marginTop: "8px" }}>
                Listeners will appear here when they tune in to your broadcast
              </div>
            </div>
          ) : (
            activeListeners.map((listener) => (
              <ListenerCard
                key={`${listener.id}-${listener.started_at}`}
                profile={listener}
                subtitle={`Listening since ${timeAgo(listener.started_at)}`}
                isLive
              />
            ))
          )}
        </div>
      )}

      {/* Followers */}
      {tab === "followers" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {followers.length === 0 ? (
            <div style={{
              padding: "40px 20px", textAlign: "center",
              backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "2px solid #27272a",
            }}>
              <div style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                NO FOLLOWERS YET
              </div>
              <div style={{ color: "#3f3f46", fontSize: "10px", marginTop: "8px" }}>
                Followers will appear here when listeners follow your channel
              </div>
            </div>
          ) : (
            followers.map((follower) => (
              <ListenerCard
                key={follower.id}
                profile={follower}
                subtitle={`Followed ${timeAgo(follower.followed_at)}`}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ListenerCard({ profile, subtitle, isLive }: {
  profile: ListenerProfile;
  subtitle: string;
  isLive?: boolean;
}) {
  const initials = profile.display_name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "12px", padding: "14px 16px",
      backgroundColor: "rgba(24, 24, 27, 0.3)",
      borderLeft: isLive ? "3px solid #4ADE80" : "2px solid #27272a",
    }}>
      {/* Avatar */}
      <div style={{
        width: "40px", height: "40px", borderRadius: "50%",
        border: "2px solid #3f3f46",
        backgroundColor: profile.avatar_url ? "transparent" : "#27272a",
        overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center",
        flexShrink: 0,
      }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt={profile.display_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: "14px", fontWeight: 700, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
            {initials}
          </span>
        )}
      </div>

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: "13px", fontWeight: 600,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {profile.display_name}
        </div>
        <div style={{
          fontSize: "10px", color: "#52525b", marginTop: "2px",
          fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          {subtitle}
        </div>
      </div>

      {/* Role badge */}
      <span style={{
        fontSize: "9px", color: "#f59e0b", textTransform: "uppercase",
        padding: "2px 6px",
        backgroundColor: "rgba(245, 158, 11, 0.1)",
        border: "1px solid rgba(245, 158, 11, 0.2)",
        borderRadius: "2px", fontWeight: 700, letterSpacing: "0.1em",
        fontFamily: "var(--font-mono)", flexShrink: 0,
      }}>
        {profile.role}
      </span>

      {/* Live indicator */}
      {isLive && (
        <div style={{
          width: "8px", height: "8px", borderRadius: "50%",
          backgroundColor: "#4ADE80",
          boxShadow: "0 0 6px rgba(74, 222, 128, 0.6)",
          flexShrink: 0,
        }} />
      )}
    </div>
  );
}

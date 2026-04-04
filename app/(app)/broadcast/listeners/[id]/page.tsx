"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface UserProfile {
  id: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  role: string;
}

interface ListenHistory {
  started_at: string;
  ended_at: string | null;
  duration_seconds: number | null;
}

export default function ListenerProfilePage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isFollower, setIsFollower] = useState(false);
  const [listenHistory, setListenHistory] = useState<ListenHistory[]>([]);
  const [totalListenTime, setTotalListenTime] = useState(0);
  const [sessionCount, setSessionCount] = useState(0);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch the listener's profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, display_name, bio, avatar_url, role")
        .eq("id", userId)
        .single();

      if (!profileData) { setLoading(false); return; }
      setProfile(profileData as UserProfile);

      // Check if they follow us
      const { data: follow } = await supabase
        .from("follows")
        .select("id")
        .eq("follower_id", userId)
        .eq("broadcaster_id", user.id)
        .maybeSingle();
      setIsFollower(!!follow);

      // Listen history for this broadcaster
      const { data: sessions } = await supabase
        .from("listener_sessions")
        .select("started_at, ended_at, duration_seconds")
        .eq("listener_id", userId)
        .eq("broadcaster_id", user.id)
        .order("started_at", { ascending: false })
        .limit(20);

      setListenHistory((sessions as ListenHistory[]) || []);
      setSessionCount(sessions?.length ?? 0);

      // Total listen time
      let total = 0;
      for (const s of sessions || []) {
        if (s.duration_seconds) {
          total += s.duration_seconds;
        } else if (s.ended_at) {
          total += Math.floor((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000);
        }
      }
      setTotalListenTime(total);

      setLoading(false);
    }
    load();
  }, [userId, supabase]);

  function formatDuration(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remainMins = mins % 60;
    return `${hrs}h ${remainMins}m`;
  }

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

  if (!profile) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          User not found
        </p>
        <button onClick={() => router.back()} style={{
          marginTop: "12px", background: "none", border: "1px solid #f59e0b",
          color: "#f59e0b", padding: "8px 16px", fontSize: "11px", cursor: "pointer",
          fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
        }}>
          Go Back
        </button>
      </div>
    );
  }

  const initials = profile.display_name
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

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
      `}</style>

      {/* ── Fixed top zone ── */}
      <div style={{
        flexShrink: 0,
        padding: "24px 20px 16px",
        backgroundColor: "var(--bg-base)",
        borderBottom: "1px solid #27272a",
      }}>
        {/* Back button */}
        <button
          onClick={() => router.back()}
          style={{
            background: "none", border: "none", color: "#f59e0b",
            cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "12px",
            padding: 0, marginBottom: "12px", display: "flex", alignItems: "center", gap: "6px",
          }}
        >
          <span>&lt;</span> Back
        </button>

        {/* Terminal header */}
        <div style={{ marginBottom: "8px" }}>
          <span style={{ color: "#f59e0b", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
            {">"} view_listener --profile
          </span>
          <span className="cursor-blink" style={{
            width: "8px", height: "12px", backgroundColor: "#f59e0b", display: "inline-block",
          }} />
        </div>

        {/* Avatar + Name */}
        <div style={{
          display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px",
        }}>
          <div style={{
            width: "72px", height: "72px", borderRadius: "50%",
            border: "2px solid #3f3f46", backgroundColor: profile.avatar_url ? "transparent" : "#27272a",
            overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
          }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt={profile.display_name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <span style={{ fontSize: "24px", fontWeight: 700, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
                {initials}
              </span>
            )}
          </div>
          <div>
            <h1 style={{
              fontSize: "22px", fontWeight: 700, textTransform: "uppercase",
              letterSpacing: "-0.05em", marginBottom: "4px",
            }}>
              {profile.display_name}<span style={{ color: "#f59e0b" }}>_</span>
            </h1>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{
                fontSize: "10px", color: "#f59e0b", textTransform: "uppercase",
                padding: "2px 6px", backgroundColor: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.2)", borderRadius: "2px",
                fontWeight: 700, letterSpacing: "0.1em", fontFamily: "var(--font-mono)",
              }}>
                {profile.role}
              </span>
              {isFollower && (
                <span style={{
                  fontSize: "10px", color: "#4ADE80", textTransform: "uppercase",
                  padding: "2px 6px", backgroundColor: "rgba(74, 222, 128, 0.1)",
                  border: "1px solid rgba(74, 222, 128, 0.2)", borderRadius: "2px",
                  fontWeight: 700, letterSpacing: "0.1em", fontFamily: "var(--font-mono)",
                }}>
                  Follows You
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Stats */}
        <div style={{
          display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px",
        }}>
          <div style={{
            padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
          }}>
            <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
              Sessions
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{sessionCount}</div>
          </div>
          <div style={{
            padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
          }}>
            <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
              Total Time
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700 }}>{formatDuration(totalListenTime)}</div>
          </div>
          <div style={{
            padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
          }}>
            <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
              Status
            </div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: isFollower ? "#4ADE80" : "#71717a" }}>
              {isFollower ? "FOLLOWER" : "VISITOR"}
            </div>
          </div>
        </div>
      </div>{/* end fixed top zone */}

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>
      {/* Bio */}
      {profile.bio && (
        <div style={{
          padding: "16px", backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderLeft: "3px solid #f59e0b", marginBottom: "16px",
        }}>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
            Bio
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6, textAlign: "center" }}>
            {profile.bio}
          </div>
        </div>
      )}

      {/* Listen History */}
      {listenHistory.length > 0 && (
        <div>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
            {"// LISTEN_HISTORY"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            {listenHistory.map((session, i) => {
              const dur = session.duration_seconds
                || (session.ended_at
                  ? Math.floor((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / 1000)
                  : null);
              return (
                <div key={i} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "10px 16px", backgroundColor: "rgba(24, 24, 27, 0.3)",
                  borderLeft: session.ended_at ? "2px solid #27272a" : "3px solid #4ADE80",
                }}>
                  <div style={{ fontSize: "11px", color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
                    {timeAgo(session.started_at)}
                  </div>
                  <div style={{
                    fontSize: "10px", fontFamily: "var(--font-mono)", letterSpacing: "0.05em",
                    color: session.ended_at ? "#52525b" : "#4ADE80",
                  }}>
                    {session.ended_at ? (dur ? formatDuration(dur) : "—") : "LISTENING NOW"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>{/* end scrollable zone */}
    </div>
  );
}

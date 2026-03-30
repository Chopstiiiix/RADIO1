"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface BroadcasterProfile {
  id: string;
  channel_name: string;
  channel_slug: string;
  genre: string[] | null;
  is_live: boolean;
  monthly_listeners: number;
  handle: string | null;
}

interface UserProfile {
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
}

export default function BroadcasterPublicProfile() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [channel, setChannel] = useState<BroadcasterProfile | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [trackCount, setTrackCount] = useState(0);
  const [isFollowing, setIsFollowing] = useState(false);
  const [togglingFollow, setTogglingFollow] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data: ch } = await supabase
        .from("broadcaster_profiles")
        .select("id, channel_name, channel_slug, genre, is_live, monthly_listeners, handle")
        .eq("channel_slug", slug)
        .single();

      if (!ch) { setLoading(false); return; }
      setChannel(ch as BroadcasterProfile);

      const [profileRes, trackRes, userRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("display_name, bio, avatar_url")
          .eq("id", ch.id)
          .single(),
        supabase
          .from("tracks")
          .select("*", { count: "exact", head: true })
          .eq("broadcaster_id", ch.id)
          .eq("is_active", true),
        supabase.auth.getUser(),
      ]);

      setProfile(profileRes.data as UserProfile);
      setTrackCount(trackRes.count ?? 0);

      if (userRes.data.user) {
        setCurrentUserId(userRes.data.user.id);
        const { data: follow } = await supabase
          .from("follows")
          .select("id")
          .eq("follower_id", userRes.data.user.id)
          .eq("broadcaster_id", ch.id)
          .maybeSingle();
        setIsFollowing(!!follow);
      }

      setLoading(false);
    }
    load();
  }, [slug, supabase]);

  async function toggleFollow() {
    if (!currentUserId || !channel) return;
    setTogglingFollow(true);
    if (isFollowing) {
      await supabase.from("follows").delete()
        .eq("follower_id", currentUserId)
        .eq("broadcaster_id", channel.id);
      setIsFollowing(false);
    } else {
      await supabase.from("follows").insert({
        follower_id: currentUserId,
        broadcaster_id: channel.id,
      });
      setIsFollowing(true);
    }
    setTogglingFollow(false);
  }

  if (loading) return <InlineLoader />;

  if (!channel || !profile) {
    return (
      <div style={{ textAlign: "center", padding: "60px 20px" }}>
        <p style={{ color: "#52525b", fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          Broadcaster not found
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

      {/* Back button */}
      <button
        onClick={() => router.back()}
        style={{
          background: "none", border: "none", color: "#f59e0b",
          cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: "12px",
          padding: 0, marginBottom: "16px", display: "flex", alignItems: "center", gap: "6px",
        }}
      >
        <span>&lt;</span> Back
      </button>

      {/* Terminal header */}
      <div style={{ marginBottom: "8px" }}>
        <span style={{ color: "#f59e0b", fontSize: "13px", fontFamily: "var(--font-mono)" }}>
          {">"} view_profile --{channel.channel_slug}
        </span>
        <span className="cursor-blink" style={{
          width: "8px", height: "12px", backgroundColor: "#f59e0b", display: "inline-block",
        }} />
      </div>

      {/* Avatar + Name */}
      <div style={{
        display: "flex", alignItems: "center", gap: "16px", marginBottom: "24px",
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
          {channel.handle && (
            <div style={{ fontSize: "12px", color: "#f59e0b", fontFamily: "var(--font-mono)" }}>
              @{channel.handle}
            </div>
          )}
        </div>
      </div>

      {/* Stats */}
      <div style={{
        display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "20px",
      }}>
        <div style={{
          padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
        }}>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
            Status
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700, color: channel.is_live ? "#4ADE80" : "#71717a" }}>
            {channel.is_live ? "LIVE" : "OFFLINE"}
          </div>
        </div>
        <div style={{
          padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
        }}>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
            Tracks
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{trackCount}</div>
        </div>
        <div style={{
          padding: "14px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b",
        }}>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "4px", fontFamily: "var(--font-mono)" }}>
            Listeners
          </div>
          <div style={{ fontSize: "16px", fontWeight: 700 }}>{channel.monthly_listeners}</div>
        </div>
      </div>

      {/* Channel info */}
      <div style={{
        padding: "16px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b", marginBottom: "16px",
      }}>
        <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
          Channel
        </div>
        <div style={{ fontSize: "16px", fontWeight: 700, textTransform: "uppercase", marginBottom: "4px" }}>
          {channel.channel_name}
        </div>
        {channel.genre?.length ? (
          <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "8px" }}>
            {channel.genre.map((g) => (
              <span key={g} style={{
                fontSize: "10px", padding: "3px 8px", backgroundColor: "var(--bg-well)",
                border: "1px solid #27272a", color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
              }}>{g}</span>
            ))}
          </div>
        ) : null}
      </div>

      {/* Bio */}
      {profile.bio && (
        <div style={{
          padding: "16px", backgroundColor: "rgba(24, 24, 27, 0.3)", borderLeft: "3px solid #f59e0b", marginBottom: "16px",
        }}>
          <div style={{ fontSize: "10px", color: "#52525b", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: "8px", fontFamily: "var(--font-mono)" }}>
            Bio
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.6 }}>
            {profile.bio}
          </div>
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "8px" }}>
        {currentUserId && currentUserId !== channel.id && (
          <button
            onClick={toggleFollow}
            disabled={togglingFollow}
            style={{
              flex: 1, padding: "12px",
              backgroundColor: isFollowing ? "transparent" : "#f59e0b",
              color: isFollowing ? "#f59e0b" : "#0a0a0a",
              border: "1px solid #f59e0b", fontSize: "11px", fontWeight: 700,
              textTransform: "uppercase", letterSpacing: "0.05em", cursor: togglingFollow ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)", opacity: togglingFollow ? 0.6 : 1,
            }}
          >
            {isFollowing ? "Following" : "Follow"}
          </button>
        )}
        <a
          href={`/listen/${channel.channel_slug}`}
          style={{
            flex: 1, padding: "12px", backgroundColor: "transparent",
            border: "1px solid #27272a", color: "#a1a1aa", fontSize: "11px", fontWeight: 700,
            textTransform: "uppercase", letterSpacing: "0.05em", textDecoration: "none",
            fontFamily: "var(--font-mono)", textAlign: "center",
          }}
        >
          {channel.is_live ? "Listen Live" : "View Channel"}
        </a>
      </div>
    </div>
  );
}

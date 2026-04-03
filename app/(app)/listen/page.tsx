import { createServerSupabaseClient } from "@/lib/supabase/server";
import ChannelList from "./ChannelList";

interface Channel {
  id: string;
  channel_name: string;
  channel_slug: string;
  genre: string[] | null;
  is_live: boolean;
  monthly_listeners: number;
  profile: { display_name: string; bio: string | null };
}

export default async function ListenPage() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Only show channels that have uploaded at least one track
  const { data: broadcasterIdsWithTracks } = await supabase
    .from("tracks")
    .select("broadcaster_id")
    .eq("is_active", true);

  const activeIds = [...new Set((broadcasterIdsWithTracks || []).map((t) => t.broadcaster_id))];

  const { data: channels } = await supabase
    .from("broadcaster_profiles")
    .select(`
      id, channel_name, channel_slug, genre, is_live, monthly_listeners,
      profile:profiles!broadcaster_profiles_id_fkey(display_name, bio)
    `)
    .in("id", activeIds.length > 0 ? activeIds : ["none"])
    .order("is_live", { ascending: false })
    .order("monthly_listeners", { ascending: false });

  // Get like counts per channel
  const { data: likeCounts } = await supabase
    .from("channel_likes")
    .select("channel_slug");

  const likeMap: Record<string, number> = {};
  if (likeCounts) {
    for (const row of likeCounts) {
      likeMap[row.channel_slug] = (likeMap[row.channel_slug] || 0) + 1;
    }
  }

  // Get followed broadcaster IDs
  let followedIds: string[] = [];
  if (user) {
    const { data: follows } = await supabase
      .from("follows")
      .select("broadcaster_id")
      .eq("follower_id", user.id);
    followedIds = (follows || []).map((f) => f.broadcaster_id);
  }

  // Get follower counts per broadcaster
  const { data: allFollows } = await supabase
    .from("follows")
    .select("broadcaster_id");
  const followerMap: Record<string, number> = {};
  if (allFollows) {
    for (const row of allFollows) {
      followerMap[row.broadcaster_id] = (followerMap[row.broadcaster_id] || 0) + 1;
    }
  }

  const allChannels = (channels || []) as unknown as Channel[];

  return <ChannelList allChannels={allChannels} likeMap={likeMap} followedIds={followedIds} followerMap={followerMap} />;
}

function ChannelCard({ channel, index, likes }: { channel: any; index: number; likes: number }) {
  const isLive = channel.is_live;
  const profile = channel.profile as any;
  const chNum = String(index + 1).padStart(2, "0");

  // Signal strength based on listeners
  const listeners = channel.monthly_listeners || 0;
  const signalBars = listeners > 100 ? 4 : listeners > 50 ? 3 : listeners > 10 ? 2 : 1;

  return (
    <a
      href={`/listen/${channel.channel_slug}`}
      style={{ textDecoration: "none", color: "inherit" }}
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
            display: "flex", alignItems: "center", gap: "4px",
            fontSize: "10px",
            letterSpacing: "0.05em",
            color: isLive ? "rgba(245, 158, 11, 0.7)" : "#52525b",
          }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
            </svg>
            {listeners.toLocaleString()}
          </span>
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
            marginTop: "4px",
            fontWeight: 500,
          }}>
            HOST: {profile?.display_name || "Unknown"}
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

          {/* Listener count */}
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
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {listeners.toLocaleString()}
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
    </a>
  );
}

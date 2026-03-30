"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Broadcaster {
  id: string;
  channel_name: string;
  channel_slug: string;
  handle: string | null;
  is_live: boolean;
  profile: { display_name: string; avatar_url: string | null };
}

export default function SearchPage() {
  const supabase = createClient();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Broadcaster[]>([]);
  const [searching, setSearching] = useState(false);
  const [followedIds, setFollowedIds] = useState<Set<string>>(new Set());
  const [userId, setUserId] = useState<string | null>(null);
  const [togglingFollow, setTogglingFollow] = useState<string | null>(null);
  const [followerCounts, setFollowerCounts] = useState<Record<string, number>>({});

  // Load current user and their follows
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);

      const { data: follows } = await supabase
        .from("follows")
        .select("broadcaster_id")
        .eq("follower_id", user.id);

      if (follows) {
        setFollowedIds(new Set(follows.map((f) => f.broadcaster_id)));
      }
    }
    init();
  }, [supabase]);

  const search = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      return;
    }

    setSearching(true);
    const cleanTerm = term.replace(/^@/, "");

    const { data } = await supabase
      .from("broadcaster_profiles")
      .select(`
        id, channel_name, channel_slug, handle, is_live,
        profile:profiles!broadcaster_profiles_id_fkey(display_name, avatar_url)
      `)
      .or(`channel_name.ilike.%${cleanTerm}%,handle.ilike.%${cleanTerm}%`)
      .limit(20);

    const broadcasters = (data || []) as unknown as Broadcaster[];
    setResults(broadcasters);

    // Fetch follower counts for results
    if (broadcasters.length > 0) {
      const ids = broadcasters.map((b) => b.id);
      const { data: follows } = await supabase
        .from("follows")
        .select("broadcaster_id")
        .in("broadcaster_id", ids);
      const counts: Record<string, number> = {};
      for (const f of follows || []) {
        counts[f.broadcaster_id] = (counts[f.broadcaster_id] || 0) + 1;
      }
      setFollowerCounts(counts);
    }

    setSearching(false);
  }, [supabase]);

  // Debounced search
  useEffect(() => {
    const timeout = setTimeout(() => search(query), 300);
    return () => clearTimeout(timeout);
  }, [query, search]);

  async function toggleFollow(broadcasterId: string) {
    if (!userId) return;
    setTogglingFollow(broadcasterId);

    const isFollowed = followedIds.has(broadcasterId);

    if (isFollowed) {
      await supabase
        .from("follows")
        .delete()
        .eq("follower_id", userId)
        .eq("broadcaster_id", broadcasterId);

      setFollowedIds((prev) => {
        const next = new Set(prev);
        next.delete(broadcasterId);
        return next;
      });
    } else {
      await supabase
        .from("follows")
        .insert({ follower_id: userId, broadcaster_id: broadcasterId });

      setFollowedIds((prev) => new Set(prev).add(broadcasterId));
    }

    setTogglingFollow(null);
  }

  return (
    <div style={{ maxWidth: "460px", margin: "0 auto" }}>
      <style>{`
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .cursor-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
        .search-result:hover {
          background-color: rgba(24, 24, 27, 0.8) !important;
        }
      `}</style>

      {/* Terminal prompt */}
      <div style={{
        fontSize: "12px",
        color: "#f59e0b",
        letterSpacing: "0.05em",
        marginBottom: "16px",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        {">"} search --broadcasters
        <span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>

      <h1 style={{
        fontSize: "24px",
        fontWeight: 700,
        marginBottom: "20px",
        textTransform: "uppercase",
        letterSpacing: "-0.05em",
        color: "var(--text-primary)",
        fontFamily: "'JetBrains Mono', monospace",
      }}>
        Find Broadcasters<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      {/* Search input */}
      <div style={{
        position: "relative",
        marginBottom: "24px",
      }}>
        <svg
          width="16" height="16" viewBox="0 0 24 24"
          fill="none" stroke="#52525b" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          style={{
            position: "absolute",
            left: "12px",
            top: "50%",
            transform: "translateY(-50%)",
            pointerEvents: "none",
          }}
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="text"
          placeholder="Search by name or @handle..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            padding: "14px 14px 14px 40px",
            backgroundColor: "rgba(24, 24, 27, 0.5)",
            border: "1px solid #27272a",
            borderRadius: "0px",
            color: "var(--text-primary)",
            fontSize: "13px",
            outline: "none",
            fontFamily: "'JetBrains Mono', monospace",
            boxSizing: "border-box",
          }}
          onFocus={(e) => (e.target.style.borderColor = "#f59e0b")}
          onBlur={(e) => (e.target.style.borderColor = "#27272a")}
        />
      </div>

      {/* Results */}
      {searching && (
        <div style={{
          textAlign: "center",
          padding: "20px",
          color: "#52525b",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          Scanning frequencies...
        </div>
      )}

      {!searching && query && results.length === 0 && (
        <div style={{
          textAlign: "center",
          padding: "40px 20px",
          borderLeft: "2px solid #27272a",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
        }}>
          <div style={{
            color: "#52525b",
            fontSize: "12px",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            NO SIGNALS FOUND
          </div>
          <div style={{ color: "#3f3f46", fontSize: "10px", marginTop: "8px" }}>
            Try a different search term
          </div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {results.map((b) => {
          const profile = b.profile as any;
          const isFollowed = followedIds.has(b.id);
          const initials = (profile?.display_name || "?")
            .split(" ")
            .map((w: string) => w[0])
            .join("")
            .slice(0, 2)
            .toUpperCase();

          return (
            <div
              key={b.id}
              className="search-result"
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "14px",
                backgroundColor: "rgba(24, 24, 27, 0.4)",
                borderLeft: b.is_live ? "3px solid #f59e0b" : "2px solid #27272a",
                transition: "background-color 0.15s",
              }}
            >
              {/* Avatar */}
              <a href={`/listen/${b.channel_slug}`} style={{ textDecoration: "none", flexShrink: 0 }}>
                <div style={{
                  width: "40px",
                  height: "40px",
                  borderRadius: "50%",
                  border: b.is_live ? "2px solid #f59e0b" : "2px solid #3f3f46",
                  backgroundColor: profile?.avatar_url ? "transparent" : "#27272a",
                  overflow: "hidden",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <span style={{ fontSize: "13px", fontWeight: 700, color: "#a1a1aa", fontFamily: "'JetBrains Mono', monospace" }}>
                      {initials}
                    </span>
                  )}
                </div>
              </a>

              {/* Info */}
              <a href={`/listen/${b.channel_slug}`} style={{ textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: "14px",
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  {b.channel_name}
                </div>
                <div style={{
                  fontSize: "11px",
                  color: "#71717a",
                  fontFamily: "'JetBrains Mono', monospace",
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginTop: "2px",
                }}>
                  {b.handle && (
                    <span style={{ color: "#f59e0b" }}>@{b.handle}</span>
                  )}
                  <span>{profile?.display_name}</span>
                  {b.is_live && (
                    <span style={{
                      fontSize: "9px",
                      backgroundColor: "rgba(245, 158, 11, 0.15)",
                      color: "#f59e0b",
                      padding: "1px 5px",
                      fontWeight: 700,
                      letterSpacing: "0.05em",
                    }}>LIVE</span>
                  )}
                  <span style={{ display: "flex", alignItems: "center", gap: "3px", color: "#52525b" }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                      <circle cx="9" cy="7" r="4" />
                    </svg>
                    {followerCounts[b.id] || 0}
                  </span>
                </div>
              </a>

              {/* Follow button */}
              {userId !== b.id && (
                <button
                  onClick={() => toggleFollow(b.id)}
                  disabled={togglingFollow === b.id}
                  style={{
                    padding: "6px 14px",
                    backgroundColor: isFollowed ? "transparent" : "#f59e0b",
                    color: isFollowed ? "#f59e0b" : "#0a0a0a",
                    border: isFollowed ? "1px solid #f59e0b" : "1px solid #f59e0b",
                    borderRadius: "0px",
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    cursor: togglingFollow === b.id ? "not-allowed" : "pointer",
                    fontFamily: "'JetBrains Mono', monospace",
                    flexShrink: 0,
                    opacity: togglingFollow === b.id ? 0.6 : 1,
                  }}
                >
                  {isFollowed ? "Following" : "Follow"}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty state when no search */}
      {!query && (
        <div style={{
          textAlign: "center",
          padding: "60px 20px",
          color: "#3f3f46",
          fontSize: "11px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          <svg
            width="32" height="32" viewBox="0 0 24 24"
            fill="none" stroke="#27272a" strokeWidth="1.5"
            strokeLinecap="round" strokeLinejoin="round"
            style={{ margin: "0 auto 12px" }}
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <div>Search by channel name or @handle</div>
        </div>
      )}
    </div>
  );
}

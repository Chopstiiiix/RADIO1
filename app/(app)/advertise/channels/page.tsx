"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";

interface Channel {
  id: string;
  channel_name: string;
  channel_slug: string;
  genre: string[] | null;
  is_live: boolean;
  monthly_listeners: number;
  profile: { display_name: string };
}

export default function BrowseChannelsPage() {
  const supabase = createClient();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [adverts, setAdverts] = useState<{ id: string; title: string }[]>([]);
  const [selectedAd, setSelectedAd] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sentChannels, setSentChannels] = useState<Map<string, string>>(new Map());
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [justSent, setJustSent] = useState(false);

  // Load channels + adverts on mount
  useEffect(() => {
    async function load() {
      // Only show channels that have uploaded at least one track
      const { data: broadcasterIds } = await supabase
        .from("tracks")
        .select("broadcaster_id")
        .eq("is_active", true);
      const activeIds = [...new Set((broadcasterIds || []).map((t) => t.broadcaster_id))];

      const { data: ch } = activeIds.length > 0
        ? await supabase
          .from("broadcaster_profiles")
          .select("id, channel_name, channel_slug, genre, is_live, monthly_listeners, profile:profiles!broadcaster_profiles_id_fkey(display_name)")
          .in("id", activeIds)
          .order("monthly_listeners", { ascending: false })
        : { data: [] };
      setChannels((ch as any) || []);

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const { data: ads } = await supabase
          .from("adverts")
          .select("id, title")
          .eq("advertiser_id", user.id)
          .eq("is_active", true);
        setAdverts(ads || []);
        if (ads?.length) setSelectedAd(ads[0].id);
      }
    }
    load();
  }, [supabase]);

  // Refresh sent status whenever selectedAd changes
  const refreshSentStatus = useCallback(async () => {
    if (!userId || !selectedAd) return;
    const { data: existing } = await supabase
      .from("ad_requests")
      .select("broadcaster_id, status")
      .eq("advertiser_id", userId)
      .eq("advert_id", selectedAd)
      .in("status", ["pending", "approved"]);
    const map = new Map<string, string>();
    (existing || []).forEach((r: any) => map.set(r.broadcaster_id, r.status));
    setSentChannels(map);
    // Clear selection when ad changes
    setSelectedChannels(new Set());
  }, [userId, selectedAd, supabase]);

  useEffect(() => {
    refreshSentStatus();
  }, [refreshSentStatus]);

  function toggleChannel(e: React.MouseEvent, id: string) {
    e.preventDefault();
    e.stopPropagation();
    if (sentChannels.has(id)) return;
    setJustSent(false);
    setMessage("");
    setSelectedChannels((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    const selectable = channels.filter((ch) => !sentChannels.has(ch.id));
    const allSelected = selectable.length > 0 && selectable.every((ch) => selectedChannels.has(ch.id));
    if (allSelected) {
      setSelectedChannels(new Set());
    } else {
      setSelectedChannels(new Set(selectable.map((ch) => ch.id)));
    }
  }

  async function sendRequests() {
    if (!selectedAd) {
      setMessage("Upload an advert first");
      return;
    }
    if (selectedChannels.size === 0) {
      setMessage("Select at least one channel");
      return;
    }
    if (!userId) return;

    setSending(true);
    setMessage("");

    const rows = Array.from(selectedChannels).map((broadcasterId) => ({
      advert_id: selectedAd,
      advertiser_id: userId,
      broadcaster_id: broadcasterId,
    }));

    const { error } = await supabase.from("ad_requests").insert(rows);

    if (error) {
      setMessage(error.message);
    } else {
      // Move selected into sent as pending
      setSentChannels((prev) => {
        const next = new Map(prev);
        selectedChannels.forEach((id) => next.set(id, "pending"));
        return next;
      });
      setSelectedChannels(new Set());
      setMessage(`${rows.length} request${rows.length > 1 ? "s" : ""} sent!`);
      setJustSent(true);
    }
    setSending(false);
  }

  function handleAdChange(adId: string) {
    setSelectedAd(adId);
    setMessage("");
    setJustSent(false);
  }

  const selectableCount = channels.filter((ch) => !sentChannels.has(ch.id)).length;

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
      {/* Terminal prompt */}
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        color: "#f59e0b",
        letterSpacing: "0.05em",
        marginBottom: "8px",
      }}>
        {">"} browse_channels --advertise<span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>

      <h1 style={{
        fontSize: "24px",
        fontWeight: 700,
        marginBottom: "24px",
        textTransform: "uppercase",
        letterSpacing: "-0.05em",
      }}>
        Browse Channels<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      {/* Ad selector */}
      {adverts.length > 0 && (
        <div style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>
            Ad to place:
          </span>
          <select
            value={selectedAd}
            onChange={(e) => handleAdChange(e.target.value)}
            style={{
              padding: "8px 12px",
              backgroundColor: "rgba(24, 24, 27, 0.5)",
              border: "1px solid #27272a",
              borderRadius: "0px",
              color: "var(--text-primary)",
              fontSize: "13px",
            }}
          >
            {adverts.map((ad) => (
              <option key={ad.id} value={ad.id}>{ad.title}</option>
            ))}
          </select>
        </div>
      )}

      {/* No adverts prompt */}
      {adverts.length === 0 && userId && (
        <div style={{
          marginBottom: "24px",
          padding: "16px",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          border: "1px solid #27272a",
          borderRadius: "0px",
          fontSize: "13px",
          color: "var(--text-secondary)",
        }}>
          You need to <a href="/advertise/adverts/upload" style={{ color: "#f59e0b", textDecoration: "none" }}>upload an advert</a> before requesting ad placement.
        </div>
      )}

      {/* Status message */}
      {message && (
        <p style={{
          fontSize: "13px",
          color: message.includes("sent") ? "#4ADE80" : "#E24A4A",
          marginBottom: "16px",
          fontFamily: "var(--font-mono)",
          letterSpacing: "0.05em",
        }}>
          {message}
        </p>
      )}

      {/* Select all + Send button bar */}
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}>
        <button
          type="button"
          onClick={toggleAll}
          disabled={selectableCount === 0}
          style={{
            background: "none",
            border: "1px solid #27272a",
            borderRadius: "0px",
            padding: "6px 12px",
            color: selectableCount === 0 ? "var(--text-tertiary)" : "var(--text-secondary)",
            fontSize: "12px",
            fontFamily: "var(--font-mono)",
            cursor: selectableCount === 0 ? "default" : "pointer",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {selectedChannels.size === selectableCount && selectableCount > 0 ? "DESELECT ALL" : "SELECT ALL"}
        </button>

        <button
          type="button"
          onClick={sendRequests}
          disabled={sending}
          style={{
            padding: "8px 20px",
            backgroundColor: justSent
              ? "transparent"
              : selectedChannels.size > 0 && selectedAd
                ? "#f59e0b"
                : "var(--border-subtle)",
            color: justSent
              ? "#4ADE80"
              : selectedChannels.size > 0 && selectedAd
                ? "#0a0a0a"
                : "var(--text-tertiary)",
            border: justSent ? "1px solid #4ADE80" : selectedChannels.size > 0 && selectedAd ? "1px solid #f59e0b" : "none",
            borderRadius: "0px",
            fontSize: justSent ? "11px" : "12px",
            fontWeight: 600,
            cursor: sending || justSent ? "default" : "pointer",
            opacity: sending ? 0.6 : 1,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
          }}
        >
          {sending
            ? "SENDING..."
            : justSent
              ? <><span style={{ color: "#4ADE80" }}>REQUEST SENT</span><span style={{ color: "#f59e0b" }}>, AWAITING APPROVAL</span></>
              : selectedChannels.size > 0
                ? `REQUEST AD (${selectedChannels.size})`
                : "REQUEST AD"
          }
        </button>
      </div>

      {/* Channel list */}
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        {channels.map((ch) => {
          const isSent = sentChannels.has(ch.id);
          const requestStatus = sentChannels.get(ch.id);
          const isApproved = requestStatus === "approved";
          const isSelected = selectedChannels.has(ch.id);

          return (
            <div
              key={ch.id}
              onClick={(e) => toggleChannel(e, ch.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "16px",
                padding: "16px",
                backgroundColor: "rgba(24, 24, 27, 0.3)",
                border: "none",
                borderLeft: isSelected
                  ? "3px solid #f59e0b"
                  : "2px solid #27272a",
                borderRadius: "0px",
                cursor: isSent ? "default" : "pointer",
                opacity: isSent ? 0.6 : 1,
                transition: "border-color 0.15s",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: "20px",
                height: "20px",
                borderRadius: "0px",
                border: isSent
                  ? "2px solid #27272a"
                  : isSelected
                    ? "2px solid #f59e0b"
                    : "2px solid var(--border-strong)",
                backgroundColor: isSelected ? "#f59e0b" : isSent ? "#27272a" : "transparent",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
                transition: "all 0.15s",
              }}>
                {(isSelected || isSent) && (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke={isSent ? "var(--text-tertiary)" : "#000"} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>

              {/* Channel info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: "15px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}>
                  {ch.channel_name}
                </div>
                <div style={{ color: "var(--text-secondary)", fontSize: "13px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {(ch.profile as any)?.display_name}
                  {ch.genre?.length ? ` — ${ch.genre.join(", ")}` : ""}
                </div>
              </div>

              {/* Listeners */}
              <div style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                color: "var(--text-tertiary)",
                whiteSpace: "nowrap",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                {ch.monthly_listeners.toLocaleString()} listeners
              </div>

              {/* Live badge */}
              {ch.is_live && (
                <span style={{ fontSize: "10px", color: "#E24A4A", fontFamily: "var(--font-mono)", fontWeight: 600, letterSpacing: "0.1em" }}>LIVE</span>
              )}

              {/* Sent status */}
              {isSent ? (
                <div style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-end",
                  gap: "2px",
                  minWidth: "110px",
                  flexShrink: 0,
                }}>
                  {isApproved ? (
                    <span style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: "10px",
                      fontWeight: 600,
                      color: "#4ADE80",
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                    }}>
                      APPROVED
                    </span>
                  ) : (
                    <>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "10px",
                        fontWeight: 600,
                        color: "#4ADE80",
                        textTransform: "uppercase",
                        letterSpacing: "0.05em",
                      }}>
                        REQUEST SENT
                      </span>
                      <span style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: "9px",
                        color: "#f59e0b",
                        letterSpacing: "0.05em",
                      }}>
                        WAITING APPROVAL
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div style={{ minWidth: "110px", flexShrink: 0 }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import Lottie from "lottie-react";
import notificationAnimation from "@/public/notification.json";

interface Notification {
  id: string;
  type: "ad_request" | "ad_response";
  title: string;
  subtitle: string;
  href: string;
  time: string;
}

export default function NotificationButton({ role }: { role: string }) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Load notification count on mount and poll every 30s
  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, [role]);

  async function loadNotifications() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); return; }

    const items: Notification[] = [];

    if (role === "broadcaster") {
      // Pending ad requests waiting for broadcaster approval
      const { data: pending } = await supabase
        .from("ad_requests")
        .select(`
          id, frequency, requested_at,
          advert:adverts(title),
          advertiser:profiles!ad_requests_advertiser_id_fkey(display_name)
        `)
        .eq("broadcaster_id", user.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(10);

      if (pending) {
        for (const req of pending as any[]) {
          items.push({
            id: req.id,
            type: "ad_request",
            title: `Ad request: ${req.advert?.title ?? "Unknown"}`,
            subtitle: `From ${req.advertiser?.display_name ?? "Unknown"} — ${req.frequency}`,
            href: "/broadcast/ads",
            time: formatTime(req.requested_at),
          });
        }
      }
    }

    if (role === "advertiser") {
      // Ad requests that have been responded to (approved/declined)
      const { data: responded } = await supabase
        .from("ad_requests")
        .select(`
          id, status, frequency, responded_at,
          advert:adverts(title),
          broadcaster:profiles!ad_requests_broadcaster_id_fkey(display_name)
        `)
        .eq("advertiser_id", user.id)
        .in("status", ["approved", "declined"])
        .not("responded_at", "is", null)
        .order("responded_at", { ascending: false })
        .limit(10);

      if (responded) {
        for (const req of responded as any[]) {
          items.push({
            id: req.id,
            type: "ad_response",
            title: `${req.advert?.title ?? "Ad"} — ${req.status.toUpperCase()}`,
            subtitle: `By ${req.broadcaster?.display_name ?? "Unknown"}`,
            href: "/advertise/requests",
            time: formatTime(req.responded_at),
          });
        }
      }

      // Pending requests (awaiting response)
      const { data: pending } = await supabase
        .from("ad_requests")
        .select(`
          id, frequency, requested_at,
          advert:adverts(title),
          broadcaster:profiles!ad_requests_broadcaster_id_fkey(display_name)
        `)
        .eq("advertiser_id", user.id)
        .eq("status", "pending")
        .order("requested_at", { ascending: false })
        .limit(10);

      if (pending) {
        for (const req of pending as any[]) {
          items.push({
            id: req.id,
            type: "ad_request",
            title: `Pending: ${req.advert?.title ?? "Ad"}`,
            subtitle: `Sent to ${req.broadcaster?.display_name ?? "Unknown"}`,
            href: "/advertise/requests",
            time: formatTime(req.requested_at),
          });
        }
      }
    }

    setNotifications(items);
    setLoading(false);
  }

  function handleToggle() {
    if (!open) loadNotifications();
    setOpen(!open);
  }

  const count = notifications.length;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={handleToggle}
        aria-label="Notifications"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
        }}
      >
        <Lottie
          animationData={notificationAnimation}
          loop={count > 0}
          autoplay={count > 0}
          style={{ width: 28, height: 28 }}
        />
        {count > 0 && (
          <span style={{
            position: "absolute",
            top: "0px",
            right: "-2px",
            width: "16px",
            height: "16px",
            backgroundColor: "#EF4444",
            borderRadius: "50%",
            fontSize: "9px",
            fontWeight: 700,
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            border: "2px solid var(--bg-base, #0a0a0a)",
          }}>
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 8px)",
          right: 0,
          width: "300px",
          maxHeight: "400px",
          overflowY: "auto",
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "0px",
          zIndex: 200,
          boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
        }}>
          {/* Header */}
          <div style={{
            padding: "12px 16px",
            borderBottom: "1px solid #27272a",
            fontSize: "10px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "#f59e0b",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Notifications
          </div>

          {loading ? (
            <div style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: "11px",
              color: "#52525b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}>
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div style={{
              padding: "32px 16px",
              textAlign: "center",
              fontSize: "11px",
              color: "#52525b",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              No notifications
            </div>
          ) : (
            notifications.map((n) => (
              <a
                key={n.id}
                href={n.href}
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  padding: "12px 16px",
                  borderBottom: "1px solid #27272a",
                  textDecoration: "none",
                  transition: "background-color 0.15s",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(245, 158, 11, 0.05)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.backgroundColor = "transparent";
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <div style={{
                    width: "6px",
                    height: "6px",
                    borderRadius: "50%",
                    backgroundColor: n.type === "ad_response"
                      ? (n.title.includes("APPROVED") ? "#4ADE80" : "#EF4444")
                      : "#f59e0b",
                    marginTop: "5px",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: "12px",
                      fontWeight: 600,
                      color: "#e4e4e7",
                      textTransform: "uppercase",
                      letterSpacing: "-0.02em",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {n.title}
                    </div>
                    <div style={{
                      fontSize: "11px",
                      color: "#71717a",
                      marginTop: "2px",
                    }}>
                      {n.subtitle}
                    </div>
                    <div style={{
                      fontSize: "10px",
                      color: "#3f3f46",
                      marginTop: "4px",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {n.time}
                    </div>
                  </div>
                </div>
              </a>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

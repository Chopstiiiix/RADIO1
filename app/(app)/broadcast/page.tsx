import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function BroadcastDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "broadcaster") redirect("/listen");

  const { data: channel } = await supabase
    .from("broadcaster_profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  const { count: trackCount } = await supabase
    .from("tracks")
    .select("*", { count: "exact", head: true })
    .eq("broadcaster_id", user.id)
    .eq("is_active", true);

  const { count: pendingAds } = await supabase
    .from("ad_requests")
    .select("*", { count: "exact", head: true })
    .eq("broadcaster_id", user.id)
    .eq("status", "pending");

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
        <span style={{ color: "#f59e0b", fontSize: "13px" }}>{"> "}broadcast_dash --status</span>
        <span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>

      <div style={{ marginBottom: "32px" }}>
        <h1 style={{
          fontSize: "28px",
          fontWeight: 700,
          letterSpacing: "-0.05em",
          textTransform: "uppercase",
          color: "#f5f5f5",
        }}>
          {channel?.channel_name ?? "Your Channel"}
        </h1>
        <p style={{
          color: "#52525b",
          fontSize: "11px",
          marginTop: "4px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}>
          /{channel?.channel_slug} — Broadcaster Dashboard
        </p>
      </div>

      {/* Stats Grid */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        gap: "16px",
        marginBottom: "32px",
      }}>
        <StatCard label="Status" value={channel?.is_live ? "ON AIR" : "OFFLINE"} accent={channel?.is_live} />
        <StatCard label="Tracks" value={String(trackCount ?? 0)} />
        <StatCard label="Monthly Listeners" value={String(channel?.monthly_listeners ?? 0)} />
        <StatCard label="Pending Ad Requests" value={String(pendingAds ?? 0)} />
      </div>

      {/* Quick Actions */}
      <div style={{
        fontSize: "10px",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        color: "#52525b",
        marginBottom: "12px",
      }}>
        {"// QUICK_ACTIONS"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
        <a href="/broadcast/tracks" style={{
          padding: "12px 20px",
          backgroundColor: channel?.is_live ? "transparent" : "#4ADE80",
          border: channel?.is_live ? "1px solid #4ADE80" : "none",
          color: channel?.is_live ? "#4ADE80" : "#0a0a0a",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          textDecoration: "none",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
            <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.4" />
            <circle cx="12" cy="12" r="2" fill="currentColor" />
            <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.4" />
            <path d="M19.1 4.9C23 8.8 23 15.2 19.1 19.1" />
          </svg>
          {channel?.is_live ? "NOW BROADCASTING" : "START BROADCAST"}
        </a>
        <ActionButton href="/broadcast/tracks/upload" label="Upload Track" />
        <ActionButton href="/broadcast/tracks" label="Manage Tracks" />
        <ActionButton href="/broadcast/ads" label="Review Ads" />
        <ActionButton href="/broadcast/profile" label="Edit Profile" />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div style={{
      padding: "20px",
      backgroundColor: "rgba(24, 24, 27, 0.3)",
      borderLeft: "3px solid #f59e0b",
    }}>
      <div style={{
        fontSize: "10px",
        color: "#52525b",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "8px",
      }}>{label}</div>
      <div style={{
        fontSize: "22px",
        fontWeight: 700,
        color: accent ? "#4ADE80" : "#f5f5f5",
      }}>{value}</div>
    </div>
  );
}

function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{
      padding: "12px 16px",
      backgroundColor: "transparent",
      border: "1px solid #27272a",
      color: "#a1a1aa",
      fontSize: "11px",
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      textDecoration: "none",
      textAlign: "center",
      transition: "border-color 0.15s",
    }}>{label}</a>
  );
}

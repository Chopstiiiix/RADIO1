import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdvertiseDashboard() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "advertiser") redirect("/listen");

  const { count: adCount } = await supabase
    .from("adverts")
    .select("*", { count: "exact", head: true })
    .eq("advertiser_id", user.id);

  const { count: pendingCount } = await supabase
    .from("ad_requests")
    .select("*", { count: "exact", head: true })
    .eq("advertiser_id", user.id)
    .eq("status", "pending");

  const { count: approvedCount } = await supabase
    .from("ad_requests")
    .select("*", { count: "exact", head: true })
    .eq("advertiser_id", user.id)
    .eq("status", "approved");

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
      <div style={{ fontSize: "12px", color: "#f59e0b", letterSpacing: "0.05em", marginBottom: "8px", fontFamily: "monospace" }}>
        {"> advertiser_dash --status"}<span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>
      <h1 style={{ fontSize: "28px", fontWeight: 700, letterSpacing: "-0.05em", marginBottom: "8px", textTransform: "uppercase" }}>
        Advertiser Dashboard<span style={{ color: "#f59e0b" }}>_</span>
      </h1>
      <p style={{ color: "#52525b", fontSize: "12px", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "32px" }}>
        Welcome back, {profile?.display_name}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <StatCard label="My Adverts" value={String(adCount ?? 0)} accent href="/advertise/adverts" />
        <StatCard label="Pending Requests" value={String(pendingCount ?? 0)} href="/advertise/requests" />
        <StatCard label="Approved Placements" value={String(approvedCount ?? 0)} href="/advertise/requests" />
      </div>

      {/* // QUICK_ACTIONS */}
      <div style={{ fontSize: "10px", color: "#52525b", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: "12px", fontFamily: "monospace" }}>
        {"// QUICK_ACTIONS"}
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        <ActionButton href="/advertise/adverts/upload" label="Upload Advert" />
        <ActionButton href="/advertise/channels" label="Browse Channels" />
        <ActionButton href="/advertise/requests" label="My Requests" />
      </div>
    </div>
  );
}

function StatCard({ label, value, accent, href }: { label: string; value: string; accent?: boolean; href?: string }) {
  const content = (
    <div style={{
      padding: "20px",
      backgroundColor: "rgba(24, 24, 27, 0.3)",
      borderLeft: accent ? "3px solid #f59e0b" : "3px solid #27272a",
      borderRadius: "0px",
      cursor: href ? "pointer" : "default",
      transition: "background-color 0.15s",
    }}>
      <div style={{
        fontFamily: "monospace",
        fontSize: "10px",
        color: "#52525b",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "8px",
      }}>{label}</div>
      <div style={{ fontSize: "22px", fontWeight: 700 }}>{value}</div>
    </div>
  );

  if (href) {
    return <a href={href} className="action-btn" style={{ textDecoration: "none", color: "inherit", display: "block", padding: 0, border: "none" }}>{content}</a>;
  }
  return content;
}

function ActionButton({ href, label }: { href: string; label: string }) {
  return (
    <a href={href} style={{
      padding: "8px 16px",
      border: "1px solid #27272a",
      borderRadius: "0px",
      color: "#a1a1aa",
      fontSize: "11px",
      fontWeight: 500,
      textTransform: "uppercase",
      letterSpacing: "0.05em",
      textDecoration: "none",
    }}>{label}</a>
  );
}

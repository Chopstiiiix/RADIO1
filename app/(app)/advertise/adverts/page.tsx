"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import TrashButton from "@/app/components/TrashButton";
import InlineLoader from "@/app/components/InlineLoader";

interface Advert {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  is_active: boolean;
  uploaded_at: string;
  approval_status: "approved" | "pending" | "declined" | "none";
}

export default function MyAdvertsPage() {
  const supabase = createClient();
  const [adverts, setAdverts] = useState<Advert[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("adverts")
      .select("id, title, description, duration_seconds, is_active, uploaded_at")
      .eq("advertiser_id", user.id)
      .order("uploaded_at", { ascending: false });

    // Fetch ad request statuses for each advert
    const { data: requests } = await supabase
      .from("ad_requests")
      .select("advert_id, status")
      .eq("advertiser_id", user.id);

    const statusMap: Record<string, string> = {};
    if (requests) {
      for (const r of requests) {
        // Priority: approved > pending > declined
        const current = statusMap[r.advert_id];
        if (!current || r.status === "approved" || (r.status === "pending" && current !== "approved")) {
          statusMap[r.advert_id] = r.status;
        }
      }
    }

    setAdverts((data || []).map((ad: any) => ({
      ...ad,
      approval_status: (statusMap[ad.id] as any) || "none",
    })));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(id: string, current: boolean) {
    await supabase.from("adverts").update({ is_active: !current }).eq("id", id);
    load();
  }

  async function deleteAdvert(id: string) {
    if (!confirm("Delete this advert?")) return;
    await supabase.from("adverts").delete().eq("id", id);
    load();
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      height: "calc(100dvh - 65px)",
      marginTop: "-24px",
      marginLeft: "-20px",
      marginRight: "-20px",
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
        <div style={{ marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "#f59e0b" }}>
          {"> advert_list --mine"}<span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "24px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.05em" }}>My Adverts<span style={{ color: "#f59e0b" }}>_</span></h1>
          <a href="/advertise/adverts/upload" style={{
            padding: "10px 20px",
            backgroundColor: "#f59e0b",
            color: "#0a0a0a",
            borderRadius: "0px",
            fontSize: "11px",
            fontWeight: 700,
            textDecoration: "none",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
          }}>Upload Advert</a>
        </div>
      </div>{/* end fixed top zone */}

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>
      {loading ? (
        <InlineLoader />
      ) : adverts.length === 0 ? (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderRadius: "0px",
          borderLeft: "2px solid #27272a",
        }}>
          <p style={{ color: "var(--text-secondary)", marginBottom: "12px", textTransform: "uppercase", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.05em" }}>No adverts uploaded yet</p>
          <a href="/advertise/adverts/upload" style={{ color: "#f59e0b", textDecoration: "none", textTransform: "uppercase", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.05em" }}>
            Upload your first advert
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {adverts.map((ad) => (
            <div key={ad.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px",
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              border: "none",
              borderLeft: "2px solid #27272a",
              borderRadius: "0px",
              opacity: ad.is_active ? 1 : 0.5,
            }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "14px", textTransform: "uppercase" }}>{ad.title}</div>
                {ad.description && (
                  <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{ad.description}</div>
                )}
              </div>

              <button onClick={() => toggleActive(ad.id, ad.is_active)} style={{
                background: "none",
                border: "1px solid var(--border-subtle)",
                color: ad.is_active && ad.approval_status === "approved"
                  ? "#4ADE80"
                  : ad.approval_status === "declined"
                    ? "#E24A4A"
                    : ad.is_active
                      ? "#f59e0b"
                      : "var(--text-tertiary)",
                padding: "4px 10px",
                borderRadius: "0px",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}>
                {ad.is_active && ad.approval_status === "approved"
                  ? "ACTIVE"
                  : ad.approval_status === "declined"
                    ? "DECLINED"
                    : ad.is_active
                      ? "READY"
                      : "INACTIVE"}
              </button>

              <TrashButton onClick={() => deleteAdvert(ad.id)} />
            </div>
          ))}
        </div>
      )}
      </div>{/* end scrollable zone */}
    </div>
  );
}

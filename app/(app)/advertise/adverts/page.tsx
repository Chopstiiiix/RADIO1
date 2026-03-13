"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface Advert {
  id: string;
  title: string;
  description: string | null;
  duration_seconds: number | null;
  is_active: boolean;
  uploaded_at: string;
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

    setAdverts(data || []);
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
      <div style={{ marginBottom: "4px", fontFamily: "var(--font-mono)", fontSize: "11px", color: "#f59e0b" }}>
        {"> advert_list --mine"}<span className="cursor-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
        <h1 style={{ fontSize: "24px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "-0.05em" }}>My Adverts</h1>
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

      {loading ? (
        <p style={{ color: "#52525b", textTransform: "uppercase", fontFamily: "var(--font-mono)", fontSize: "11px", letterSpacing: "0.05em" }}>Loading...</p>
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
                color: ad.is_active ? "#4ADE80" : "var(--text-tertiary)",
                padding: "4px 10px",
                borderRadius: "0px",
                fontSize: "11px",
                cursor: "pointer",
                fontFamily: "var(--font-mono)",
              }}>
                {ad.is_active ? "ACTIVE" : "INACTIVE"}
              </button>

              <button onClick={() => deleteAdvert(ad.id)} style={{
                background: "none",
                border: "none",
                color: "#52525b",
                cursor: "pointer",
                fontSize: "16px",
              }}>x</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

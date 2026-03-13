"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";

interface AdRequest {
  id: string;
  status: string;
  frequency: string;
  requested_at: string;
  advert: { title: string; description: string | null };
  advertiser: { display_name: string };
}

export default function AdRequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from("ad_requests")
      .select(`
        id, status, frequency, requested_at,
        advert:adverts(title, description),
        advertiser:profiles!ad_requests_advertiser_id_fkey(display_name)
      `)
      .eq("broadcaster_id", user.id)
      .order("requested_at", { ascending: false });

    setRequests((data as any) || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function respond(id: string, status: "approved" | "declined") {
    await supabase.from("ad_requests").update({
      status,
      responded_at: new Date().toISOString(),
    }).eq("id", id);
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
      <div style={{
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        color: "#f59e0b",
        marginBottom: "8px",
      }}>
        {"> ad_requests --review"}
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
        marginBottom: "24px",
        textTransform: "uppercase",
        letterSpacing: "-0.05em",
      }}>
        Ad Requests<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      {loading ? (
        <InlineLoader />
      ) : requests.length === 0 ? (
        <div style={{
          padding: "60px 20px",
          textAlign: "center",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderRadius: "0px",
          borderLeft: "2px solid #27272a",
        }}>
          <p style={{
            color: "var(--text-secondary)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontFamily: "var(--font-mono)",
            fontSize: "12px",
          }}>
            No ad requests yet
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {requests.map((req) => (
            <div key={req.id} style={{
              padding: "16px",
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              borderLeft: "2px solid #27272a",
              borderRadius: "0px",
              display: "flex",
              alignItems: "center",
              gap: "16px",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: "14px",
                  textTransform: "uppercase",
                }}>
                  {(req.advert as any)?.title ?? "Unknown Ad"}
                </div>
                <div style={{ fontSize: "13px" }}>
                  <span style={{
                    color: "#52525b",
                    textTransform: "uppercase",
                  }}>
                    From:
                  </span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {(req.advertiser as any)?.display_name ?? "Unknown"} — {req.frequency}
                  </span>
                </div>
                {(req.advert as any)?.description && (
                  <div style={{ color: "var(--text-tertiary)", fontSize: "12px", marginTop: "4px" }}>
                    {(req.advert as any).description}
                  </div>
                )}
              </div>

              <div style={{ fontFamily: "var(--font-mono)", fontSize: "11px", textTransform: "uppercase" }}>
                {req.status === "pending" ? (
                  <div style={{ display: "flex", gap: "8px" }}>
                    <button onClick={() => respond(req.id, "approved")} style={{
                      padding: "6px 14px",
                      backgroundColor: "rgba(74, 222, 128, 0.1)",
                      border: "1px solid #4ADE80",
                      color: "#4ADE80",
                      borderRadius: "0px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}>Approve</button>
                    <button onClick={() => respond(req.id, "declined")} style={{
                      padding: "6px 14px",
                      backgroundColor: "rgba(245, 158, 11, 0.1)",
                      border: "1px solid #f59e0b",
                      color: "#f59e0b",
                      borderRadius: "0px",
                      cursor: "pointer",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                    }}>Decline</button>
                  </div>
                ) : (
                  <span style={{
                    color: req.status === "approved" ? "#4ADE80" : "#E24A4A",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}>{req.status}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

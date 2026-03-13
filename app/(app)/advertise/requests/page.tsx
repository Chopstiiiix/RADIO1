"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

interface AdRequest {
  id: string;
  status: string;
  frequency: string;
  requested_at: string;
  responded_at: string | null;
  advert: { title: string };
  broadcaster: { display_name: string };
}

export default function RequestsPage() {
  const supabase = createClient();
  const [requests, setRequests] = useState<AdRequest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("ad_requests")
        .select(`
          id, status, frequency, requested_at, responded_at,
          advert:adverts(title),
          broadcaster:profiles!ad_requests_broadcaster_id_fkey(display_name)
        `)
        .eq("advertiser_id", user.id)
        .order("requested_at", { ascending: false });

      setRequests((data as any) || []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  function statusColor(status: string) {
    if (status === "approved") return "#4ADE80";
    if (status === "declined") return "#E24A4A";
    return "#f59e0b";
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
        {">"} request_status --mine<span className="cursor-blink" style={{
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
        My Requests
      </h1>

      {loading ? (
        <p style={{
          color: "#52525b",
          textTransform: "uppercase",
          fontFamily: "var(--font-mono)",
          fontSize: "13px",
        }}>
          Loading...
        </p>
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
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
          }}>
            No requests yet
          </p>
          <a href="/advertise/channels" style={{
            color: "var(--accent-blue)",
            textDecoration: "none",
            fontSize: "14px",
            textTransform: "uppercase",
          }}>
            Browse channels to place ads
          </a>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {requests.map((req) => (
            <div key={req.id} style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              padding: "16px",
              backgroundColor: "rgba(24, 24, 27, 0.3)",
              borderLeft: "2px solid #27272a",
              borderRadius: "0px",
            }}>
              <div style={{ flex: 1 }}>
                <div style={{
                  fontWeight: 600,
                  fontSize: "14px",
                  textTransform: "uppercase",
                }}>
                  {(req.advert as any)?.title}
                </div>
                <div style={{ fontSize: "13px" }}>
                  <span style={{ color: "#52525b", textTransform: "uppercase" }}>To:</span>{" "}
                  <span style={{ color: "var(--text-secondary)" }}>
                    {(req.broadcaster as any)?.display_name} — {req.frequency}
                  </span>
                </div>
              </div>

              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "11px",
                fontWeight: 600,
                color: statusColor(req.status),
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}>
                {req.status}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

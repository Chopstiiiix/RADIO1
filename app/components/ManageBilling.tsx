"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ManageBilling() {
  const supabase = createClient();
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("subscription_status")
        .eq("id", user.id)
        .single();
      setStatus(data?.subscription_status || "incomplete");
    }
    load();
  }, []);

  async function openPortal() {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* ignore */ }
    setPortalLoading(false);
  }

  async function subscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval: "monthly" }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch { /* ignore */ }
    setLoading(false);
  }

  if (status === null) return null;

  const isActive = status === "active" || status === "trialing";
  const statusColor = isActive ? "#4ADE80" : status === "past_due" ? "#f59e0b" : "#E24A4A";
  const statusLabel = status === "trialing" ? "TRIAL" : status === "active" ? "ACTIVE" : status === "past_due" ? "PAST DUE" : status === "canceled" ? "CANCELED" : "INACTIVE";

  return (
    <div style={{
      padding: "16px",
      backgroundColor: "rgba(24, 24, 27, 0.3)",
      borderLeft: `2px solid ${statusColor}`,
      marginTop: "16px",
    }}>
      <div style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }}>
        <span style={{
          fontSize: "12px", fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase",
          color: "#d4d4d8", fontFamily: "var(--font-mono)",
        }}>
          Subscription
        </span>
        <span style={{
          fontSize: "10px", fontWeight: 700,
          padding: "2px 8px",
          backgroundColor: `${statusColor}20`,
          border: `1px solid ${statusColor}40`,
          color: statusColor,
          letterSpacing: "0.1em",
          fontFamily: "var(--font-mono)",
        }}>
          {statusLabel}
        </span>
      </div>

      {isActive ? (
        <button
          type="button"
          onClick={openPortal}
          disabled={portalLoading}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "transparent",
            color: "#f59e0b",
            border: "1px solid #f59e0b",
            fontSize: "11px",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: portalLoading ? "not-allowed" : "pointer",
            opacity: portalLoading ? 0.6 : 1,
          }}
        >
          {portalLoading ? "Loading..." : "Manage Billing"}
        </button>
      ) : (
        <button
          type="button"
          onClick={subscribe}
          disabled={loading}
          style={{
            width: "100%",
            padding: "10px",
            backgroundColor: "#f59e0b",
            color: "#0a0a0a",
            border: "none",
            fontSize: "11px",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? "Loading..." : "Subscribe"}
        </button>
      )}
    </div>
  );
}

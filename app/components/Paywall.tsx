"use client";

import { useState } from "react";
import { PLAN_DETAILS, type SubscribableRole, type BillingInterval } from "@/lib/plans";

export default function Paywall({ role }: { role: SubscribableRole }) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [loading, setLoading] = useState(false);
  const plan = PLAN_DETAILS[role];
  const price = interval === "monthly" ? plan.monthly : plan.annual;
  const savingsPerYear = plan.monthly * 12 - plan.annual;

  async function subscribe() {
    setLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      zIndex: 9000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      backdropFilter: "blur(12px)",
      WebkitBackdropFilter: "blur(12px)",
      padding: "20px",
    }}>
      <div style={{
        maxWidth: "380px",
        width: "100%",
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
        padding: "32px 24px",
        textAlign: "center",
        fontFamily: "var(--font-mono)",
      }}>
        {/* Logo */}
        <div style={{
          fontSize: "20px", fontWeight: 800, letterSpacing: "-0.05em",
          color: "#f59e0b", textTransform: "uppercase", marginBottom: "4px",
        }}>
          Caster<span style={{ color: "#fff" }}>_</span>
        </div>
        <div style={{
          fontSize: "10px", letterSpacing: "0.15em", color: "#71717a",
          textTransform: "uppercase", marginBottom: "24px",
        }}>
          {plan.label} Plan
        </div>

        {/* Trial badge */}
        <div style={{
          display: "inline-block",
          padding: "4px 12px",
          backgroundColor: "rgba(245, 158, 11, 0.1)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          fontSize: "11px",
          fontWeight: 700,
          color: "#f59e0b",
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          marginBottom: "20px",
        }}>
          7 Days Free Trial
        </div>

        {/* Interval toggle */}
        <div style={{
          display: "flex",
          gap: "0px",
          marginBottom: "20px",
          border: "1px solid #27272a",
        }}>
          <button
            type="button"
            onClick={() => setInterval("monthly")}
            style={{
              flex: 1,
              padding: "10px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              border: "none",
              cursor: "pointer",
              backgroundColor: interval === "monthly" ? "#f59e0b" : "transparent",
              color: interval === "monthly" ? "#0a0a0a" : "#71717a",
              transition: "all 0.15s",
            }}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setInterval("annual")}
            style={{
              flex: 1,
              padding: "10px",
              fontSize: "11px",
              fontWeight: 700,
              letterSpacing: "0.05em",
              textTransform: "uppercase",
              fontFamily: "var(--font-mono)",
              border: "none",
              borderLeft: "1px solid #27272a",
              cursor: "pointer",
              backgroundColor: interval === "annual" ? "#f59e0b" : "transparent",
              color: interval === "annual" ? "#0a0a0a" : "#71717a",
              transition: "all 0.15s",
            }}
          >
            Annual
          </button>
        </div>

        {/* Price */}
        <div style={{ marginBottom: "8px" }}>
          <span style={{
            fontSize: "40px", fontWeight: 800, color: "#fff",
            letterSpacing: "-0.03em",
          }}>
            ${price}
          </span>
          <span style={{
            fontSize: "14px", color: "#71717a", marginLeft: "4px",
          }}>
            /{interval === "monthly" ? "mo" : "yr"}
          </span>
        </div>

        {interval === "annual" && (
          <div style={{
            fontSize: "11px", color: "#4ADE80",
            marginBottom: "20px", fontWeight: 600,
          }}>
            Save ${savingsPerYear}/year
          </div>
        )}
        {interval === "monthly" && (
          <div style={{ fontSize: "11px", color: "#52525b", marginBottom: "20px" }}>
            Billed monthly after trial
          </div>
        )}

        {/* Features */}
        <div style={{
          textAlign: "left",
          marginBottom: "24px",
          padding: "16px",
          backgroundColor: "rgba(24, 24, 27, 0.5)",
          border: "1px solid #27272a",
        }}>
          {role === "listener" && (
            <>
              <Feature text="Unlimited listening" />
              <Feature text="All channels access" />
              <Feature text="Follow broadcasters" />
              <Feature text="Like & share tracks" />
            </>
          )}
          {role === "broadcaster" && (
            <>
              <Feature text="Unlimited broadcasts" />
              <Feature text="AI host agents" />
              <Feature text="Ad revenue from sponsors" />
              <Feature text="Analytics dashboard" />
              <Feature text="Schedule broadcasts" />
            </>
          )}
          {role === "advertiser" && (
            <>
              <Feature text="Place ads on channels" />
              <Feature text="Target by genre" />
              <Feature text="AI-voiced ad reads" />
              <Feature text="Campaign analytics" />
            </>
          )}
        </div>

        {/* CTA */}
        <button
          type="button"
          onClick={subscribe}
          disabled={loading}
          style={{
            width: "100%",
            padding: "14px",
            backgroundColor: "#f59e0b",
            color: "#0a0a0a",
            border: "none",
            fontSize: "13px",
            fontWeight: 800,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            fontFamily: "var(--font-mono)",
            cursor: loading ? "not-allowed" : "pointer",
            opacity: loading ? 0.6 : 1,
            transition: "opacity 0.15s",
          }}
        >
          {loading ? "Loading..." : "Start Free Trial"}
        </button>

        <div style={{
          fontSize: "10px", color: "#52525b", marginTop: "12px",
          lineHeight: "1.5",
        }}>
          Cancel anytime during your 7-day trial.
          <br />No charge until trial ends.
        </div>
      </div>
    </div>
  );
}

function Feature({ text }: { text: string }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "8px",
      fontSize: "12px", color: "#d4d4d8", marginBottom: "8px",
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
      {text}
    </div>
  );
}

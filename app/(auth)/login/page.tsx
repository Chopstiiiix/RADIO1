"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    // Get role to redirect
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role === "broadcaster") router.push("/broadcast");
      else if (profile?.role === "advertiser") router.push("/advertise");
      else router.push("/listen");
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "var(--bg-base)",
      padding: "20px",
    }}>
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <h1 style={{
          fontSize: "40px",
          fontWeight: 700,
          letterSpacing: "-1.5px",
          marginBottom: "8px",
          textAlign: "center",
        }}>Radio1</h1>
        <p style={{
          color: "var(--text-secondary)",
          textAlign: "center",
          marginBottom: "40px",
          fontSize: "14px",
        }}>AI-Powered Multi-Channel Radio</p>

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              padding: "14px 16px",
              backgroundColor: "var(--bg-well)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
            }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: "14px 16px",
              backgroundColor: "var(--bg-well)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "8px",
              color: "var(--text-primary)",
              fontSize: "14px",
              outline: "none",
            }}
          />

          {error && (
            <p style={{ color: "#E24A4A", fontSize: "13px" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              backgroundColor: "var(--accent-blue)",
              color: "var(--bg-well)",
              border: "none",
              borderRadius: "8px",
              fontSize: "14px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "32px 0",
        }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-subtle)" }} />
          <span style={{ color: "var(--text-tertiary)", fontSize: "12px", fontFamily: "var(--font-mono)" }}>OR JOIN AS</span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "var(--border-subtle)" }} />
        </div>

        {/* Role CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          <RoleCTA
            href="/signup?role=listener"
            icon="🎧"
            title="Listener"
            description="Browse channels and enjoy live radio"
          />
          <RoleCTA
            href="/signup?role=broadcaster"
            icon="🎙️"
            title="Broadcaster"
            description="Create your own channel and go live"
          />
          <RoleCTA
            href="/signup?role=advertiser"
            icon="📢"
            title="Advertiser"
            description="Place ads on popular channels"
          />
        </div>
      </div>
    </div>
  );
}

function RoleCTA({ href, icon, title, description }: {
  href: string;
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <a
      href={href}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "14px",
        padding: "16px",
        backgroundColor: "var(--bg-panel)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "10px",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s",
      }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--accent-blue)")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
    >
      <span style={{ fontSize: "24px" }}>{icon}</span>
      <div>
        <div style={{ fontWeight: 600, fontSize: "15px" }}>{title}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: "13px" }}>{description}</div>
      </div>
    </a>
  );
}

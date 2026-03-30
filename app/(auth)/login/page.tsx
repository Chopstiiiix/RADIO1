"use client";

import { useState, Suspense } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import PasswordInput from "@/app/components/PasswordInput";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo");
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

    // Redirect to intended page or role-based default
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      if (redirectTo) {
        router.push(redirectTo);
        return;
      }
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
      fontFamily: "'JetBrains Mono', monospace",
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
      <div style={{ width: "100%", maxWidth: "400px" }}>
        {/* Logo */}
        <h1 style={{
          fontSize: "36px",
          fontWeight: 800,
          letterSpacing: "-0.05em",
          marginBottom: "4px",
          textAlign: "center",
          textTransform: "uppercase",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          Caster<span style={{ color: "#f59e0b" }}>_</span>
        </h1>
        <p style={{
          color: "#52525b",
          textAlign: "center",
          marginBottom: "32px",
          fontSize: "10px",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          fontFamily: "'JetBrains Mono', monospace",
        }}>AI-Powered Multi-Channel Radio</p>

        {/* Terminal prompt */}
        <div style={{
          fontSize: "12px",
          color: "#f59e0b",
          letterSpacing: "0.05em",
          marginBottom: "16px",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {">"} auth --sign-in
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>

        {/* Login Form */}
        <form onSubmit={handleLogin} style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          borderLeft: "3px solid #f59e0b",
          paddingLeft: "16px",
        }}>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <PasswordInput
              value={password}
              onChange={setPassword}
              placeholder="Enter password"
              required
              style={inputStyle}
            />
          </div>

          {error && (
            <p style={{ color: "#E24A4A", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              padding: "14px",
              backgroundColor: "#f59e0b",
              color: "#0a0a0a",
              border: "none",
              borderRadius: "0px",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.6 : 1,
              fontFamily: "'JetBrains Mono', monospace",
              marginTop: "4px",
            }}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        {/* Divider */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          margin: "32px 0",
        }}>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#27272a" }} />
          <span style={{
            color: "#52525b",
            fontSize: "10px",
            fontFamily: "'JetBrains Mono', monospace",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>// SELECT_ROLE</span>
          <div style={{ flex: 1, height: "1px", backgroundColor: "#27272a" }} />
        </div>

        {/* Role CTAs */}
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <RoleCTA
            href={`/signup?role=listener${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
            role="listener"
            title="Listener"
            description="Browse channels and enjoy live radio"
          />
          <RoleCTA
            href={`/signup?role=broadcaster${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
            role="broadcaster"
            title="Broadcaster"
            description="Create your own channel and go live"
          />
          <RoleCTA
            href={`/signup?role=advertiser${redirectTo ? `&redirectTo=${encodeURIComponent(redirectTo)}` : ""}`}
            role="advertiser"
            title="Advertiser"
            description="Place ads on popular channels"
          />
        </div>

        {/* Footer */}
        <div style={{
          marginTop: "40px",
          textAlign: "center",
          fontSize: "9px",
          color: "#3f3f46",
          letterSpacing: "0.05em",
          lineHeight: 1.8,
          fontFamily: "'JetBrains Mono', monospace",
          textTransform: "uppercase",
        }}>
          <div>&copy; 2026 Caster. Created by <span style={{ color: "#52525b" }}>Chopstix</span></div>
          <div>Powered by <span style={{ color: "#52525b" }}>Inspire-Edge</span> &amp; <span style={{ color: "#52525b" }}>Navada-Edge</span></div>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "10px",
  color: "#52525b",
  marginBottom: "6px",
  fontFamily: "'JetBrains Mono', monospace",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "12px",
  backgroundColor: "rgba(24, 24, 27, 0.5)",
  border: "1px solid #27272a",
  borderRadius: "0px",
  color: "var(--text-primary)",
  fontSize: "13px",
  outline: "none",
  fontFamily: "'JetBrains Mono', monospace",
  boxSizing: "border-box",
};

function RoleIcon({ role, color }: { role: string; color: string }) {
  if (role === "listener") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
  if (role === "broadcaster") return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z" />
      <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
    </svg>
  );
}

function RoleCTA({ href, role, title, description }: {
  href: string;
  role: string;
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
        padding: "14px 16px",
        backgroundColor: "transparent",
        border: "1px solid #27272a",
        borderRadius: "0px",
        textDecoration: "none",
        color: "inherit",
        transition: "border-color 0.15s",
        fontFamily: "'JetBrains Mono', monospace",
      }}
      onMouseOver={(e) => (e.currentTarget.style.borderColor = "#f59e0b")}
      onMouseOut={(e) => (e.currentTarget.style.borderColor = "#27272a")}
    >
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: "32px",
        height: "32px",
        flexShrink: 0,
      }}>
        <RoleIcon role={role} color="#a1a1aa" />
      </div>
      <div>
        <div style={{
          fontWeight: 700,
          fontSize: "12px",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
        }}>{title}</div>
        <div style={{
          color: "#52525b",
          fontSize: "11px",
        }}>{description}</div>
      </div>
    </a>
  );
}

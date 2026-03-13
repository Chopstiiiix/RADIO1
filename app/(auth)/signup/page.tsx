"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const ROLES = [
  { value: "listener", label: "Listener", icon: "🎧" },
  { value: "broadcaster", label: "Broadcaster", icon: "🎙️" },
  { value: "advertiser", label: "Advertiser", icon: "📢" },
] as const;

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const searchParams = useSearchParams();
  const initialRole = searchParams.get("role") || "listener";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState(initialRole);
  const [channelName, setChannelName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const slug = slugify(channelName || displayName);

    // Sign up — pass role + profile info as user metadata
    // The database trigger handle_new_user() creates profiles automatically
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          display_name: displayName,
          channel_name: channelName || displayName,
          channel_slug: slug,
        },
      },
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    if (!authData.user) {
      setError("Signup failed — no user returned");
      setLoading(false);
      return;
    }

    // Redirect based on role
    if (role === "broadcaster") router.push("/broadcast");
    else if (role === "advertiser") router.push("/advertise");
    else router.push("/listen");
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
        <h1 style={{
          fontSize: "32px",
          fontWeight: 700,
          letterSpacing: "-1px",
          marginBottom: "8px",
          textAlign: "center",
        }}>Join Radio1</h1>
        <p style={{
          color: "var(--text-secondary)",
          textAlign: "center",
          marginBottom: "32px",
          fontSize: "14px",
        }}>Create your account</p>

        <form onSubmit={handleSignup} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Role selector */}
          <div style={{ display: "flex", gap: "8px" }}>
            {ROLES.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                style={{
                  flex: 1,
                  padding: "12px 8px",
                  backgroundColor: role === r.value ? "var(--bg-highlight)" : "var(--bg-well)",
                  border: `1px solid ${role === r.value ? "var(--accent-blue)" : "var(--border-subtle)"}`,
                  borderRadius: "8px",
                  color: role === r.value ? "var(--accent-blue)" : "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 600,
                  textAlign: "center",
                }}
              >
                <div style={{ fontSize: "20px", marginBottom: "4px" }}>{r.icon}</div>
                {r.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            placeholder="Display Name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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

          {role === "broadcaster" && (
            <input
              type="text"
              placeholder="Channel Name"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
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
          )}

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
            placeholder="Password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
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
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p style={{ textAlign: "center", fontSize: "13px", color: "var(--text-secondary)" }}>
            Already have an account?{" "}
            <a href="/login" style={{ color: "var(--accent-blue)", textDecoration: "none" }}>Sign in</a>
          </p>
        </form>
      </div>
    </div>
  );
}

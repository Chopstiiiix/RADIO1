"use client";

import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import PasswordInput from "@/app/components/PasswordInput";
import { DateWheelPicker } from "@/app/components/ui/date-wheel-picker";

const MIN_AGE = 18;

function calculateAge(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

const ROLES = [
  { value: "listener", full: "Listener" },
  { value: "broadcaster", full: "Broadcaster" },
  { value: "advertiser", full: "Advertiser" },
] as const;

function RoleIcon({ value, color }: { value: string; color: string }) {
  if (value === "listener") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 18v-6a9 9 0 0 1 18 0v6" />
      <path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z" />
    </svg>
  );
  if (value === "broadcaster") return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  );
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6z" />
      <path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" />
    </svg>
  );
}

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
  const redirectTo = searchParams.get("redirectTo");

  const [step, setStep] = useState<"age" | "form">("age");
  const [dob, setDob] = useState(new Date(2000, 0, 1));
  const [ageError, setAgeError] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState(initialRole);
  const [channelName, setChannelName] = useState("");
  const [handle, setHandle] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  function handleAgeVerify() {
    const age = calculateAge(dob);
    if (age < MIN_AGE) {
      setAgeError(`You must be at least ${MIN_AGE} years old to create an account.`);
      return;
    }
    if (!agreedToTerms) {
      setAgeError("You must agree to the Terms & Conditions.");
      return;
    }
    setAgeError("");
    setStep("form");
  }

  function slugify(text: string) {
    return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const slug = slugify(channelName || displayName);

    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          role,
          display_name: displayName,
          channel_name: channelName || displayName,
          channel_slug: slug,
          handle: handle || undefined,
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

    if (redirectTo) {
      router.push(redirectTo);
    } else if (role === "broadcaster") {
      router.push("/broadcast");
    } else if (role === "advertiser") {
      router.push("/advertise");
    } else {
      router.push("/listen");
    }
  }

  return (
    <div className="auth-page" style={{
      height: "100dvh",
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
        @keyframes pulse-green {
          0%, 100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.5); }
          50% { box-shadow: 0 0 16px 4px rgba(16, 185, 129, 0.35); }
        }
        .cta-pulse-green {
          animation: pulse-green 1.8s ease-in-out infinite;
        }
      `}</style>
      <div style={{ width: "100%", maxWidth: "400px" }}>
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
        }}>Create your account</p>

        {/* Terminal prompt */}
        <div style={{
          fontSize: "12px",
          color: "#f59e0b",
          letterSpacing: "0.05em",
          marginBottom: "16px",
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {">"} {step === "age" ? "auth --verify-age" : "auth --register"}
          <span className="cursor-blink" style={{
            width: "8px",
            height: "12px",
            backgroundColor: "#f59e0b",
            display: "inline-block",
          }} />
        </div>

        {/* ── AGE VERIFICATION STEP ── */}
        {step === "age" && (
          <div style={{
            display: "flex",
            flexDirection: "column",
            gap: "16px",
            borderLeft: "3px solid #f59e0b",
            paddingLeft: "16px",
          }}>
            <p style={{
              fontSize: "11px",
              color: "#a1a1aa",
              fontFamily: "'JetBrains Mono', monospace",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              lineHeight: 1.6,
            }}>
              Select your date of birth
            </p>

            <DateWheelPicker
              value={dob}
              onChange={setDob}
              size="md"
              maxYear={new Date().getFullYear()}
              minYear={1920}
            />

            <p style={{
              fontSize: "10px",
              color: "#52525b",
              fontFamily: "'JetBrains Mono', monospace",
              textAlign: "center",
              letterSpacing: "0.05em",
            }}>
              {dob.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
            </p>

            {/* Terms & Conditions checkbox */}
            <label style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "10px",
              cursor: "pointer",
              fontSize: "10px",
              color: "#a1a1aa",
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.6,
              letterSpacing: "0.03em",
            }}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={{
                  marginTop: "2px",
                  accentColor: "#f59e0b",
                  width: "16px",
                  height: "16px",
                  flexShrink: 0,
                }}
              />
              <span>
                I confirm I am at least <span style={{ color: "#f59e0b" }}>{MIN_AGE} years old</span> and
                agree to the <span style={{ color: "#f59e0b", textDecoration: "underline", cursor: "pointer" }}>Terms &amp; Conditions</span> and <span style={{ color: "#f59e0b", textDecoration: "underline", cursor: "pointer" }}>Privacy Policy</span>.
              </span>
            </label>

            {ageError && (
              <p style={{ color: "#E24A4A", fontSize: "11px", textTransform: "uppercase", letterSpacing: "0.05em", fontFamily: "'JetBrains Mono', monospace" }}>{ageError}</p>
            )}

            <button
              type="button"
              onClick={handleAgeVerify}
              className={agreedToTerms ? "cta-pulse-green" : ""}
              style={{
                padding: "14px",
                backgroundColor: agreedToTerms ? "#10b981" : "#27272a",
                color: agreedToTerms ? "#0a0a0a" : "#52525b",
                border: "none",
                borderRadius: "0px",
                fontSize: "11px",
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                cursor: agreedToTerms ? "pointer" : "not-allowed",
                fontFamily: "'JetBrains Mono', monospace",
                marginTop: "4px",
                transition: "all 0.15s",
              }}
            >
              Continue
            </button>

            <p style={{
              textAlign: "center",
              fontSize: "11px",
              color: "#52525b",
              fontFamily: "'JetBrains Mono', monospace",
            }}>
              Already have an account?{" "}
              <a href={`/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`} style={{ color: "#f59e0b", textDecoration: "none" }}>Sign in</a>
            </p>
          </div>
        )}

        {/* ── REGISTRATION FORM STEP ── */}
        {step === "form" && <form onSubmit={handleSignup} style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          borderLeft: "3px solid #f59e0b",
          paddingLeft: "16px",
        }}>
          {/* Role selector */}
          <div>
            <label style={labelStyle}>Role</label>
            <div style={{ display: "flex", gap: "8px" }}>
              {ROLES.map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  style={{
                    flex: 1,
                    padding: "12px 8px",
                    backgroundColor: role === r.value ? "rgba(245, 158, 11, 0.1)" : "rgba(24, 24, 27, 0.5)",
                    border: `1px solid ${role === r.value ? "#f59e0b" : "#27272a"}`,
                    borderRadius: "0px",
                    color: role === r.value ? "#f59e0b" : "#52525b",
                    cursor: "pointer",
                    fontSize: "10px",
                    fontWeight: 700,
                    textAlign: "center",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    fontFamily: "'JetBrains Mono', monospace",
                    transition: "all 0.15s",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <RoleIcon value={r.value} color={role === r.value ? "#f59e0b" : "#52525b"} />
                  {r.full}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={labelStyle}>Display Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              style={inputStyle}
            />
          </div>

          {role === "broadcaster" && (
            <>
              <div>
                <label style={labelStyle}>Channel Name</label>
                <input
                  type="text"
                  placeholder="My Radio Channel"
                  value={channelName}
                  onChange={(e) => setChannelName(e.target.value)}
                  required
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Handle</label>
                <div style={{ position: "relative" }}>
                  <span style={{
                    position: "absolute",
                    left: "12px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#f59e0b",
                    fontSize: "13px",
                    fontFamily: "'JetBrains Mono', monospace",
                    pointerEvents: "none",
                  }}>@</span>
                  <input
                    type="text"
                    placeholder="yourhandle"
                    value={handle}
                    onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    required
                    maxLength={30}
                    style={{ ...inputStyle, paddingLeft: "28px" }}
                  />
                </div>
                <p style={{ fontSize: "9px", color: "#52525b", marginTop: "4px", letterSpacing: "0.05em" }}>
                  LETTERS, NUMBERS, UNDERSCORES ONLY
                </p>
              </div>
            </>
          )}

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
              placeholder="Min 6 characters"
              required
              minLength={6}
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
            {loading ? "Creating account..." : "Create Account"}
          </button>

          <p style={{
            textAlign: "center",
            fontSize: "11px",
            color: "#52525b",
            fontFamily: "'JetBrains Mono', monospace",
          }}>
            Already have an account?{" "}
            <a href={`/login${redirectTo ? `?redirectTo=${encodeURIComponent(redirectTo)}` : ""}`} style={{ color: "#f59e0b", textDecoration: "none" }}>Sign in</a>
          </p>
        </form>}
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

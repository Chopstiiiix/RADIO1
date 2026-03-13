"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";
import { useRouter } from "next/navigation";

export default function BroadcasterProfile() {
  const supabase = createClient();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [channelName, setChannelName] = useState("");
  const [genre, setGenre] = useState("");

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, bio")
        .eq("id", user.id)
        .single();

      const { data: channel } = await supabase
        .from("broadcaster_profiles")
        .select("channel_name, genre")
        .eq("id", user.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name);
        setBio(profile.bio || "");
      }
      if (channel) {
        setChannelName(channel.channel_name);
        setGenre((channel.genre || []).join(", "));
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const genreArray = genre.split(",").map((g) => g.trim()).filter(Boolean);

    const [profileRes, channelRes] = await Promise.all([
      supabase.from("profiles").update({
        display_name: displayName,
        bio,
        updated_at: new Date().toISOString(),
      }).eq("id", user.id),
      supabase.from("broadcaster_profiles").update({
        channel_name: channelName,
        genre: genreArray,
      }).eq("id", user.id),
    ]);

    if (profileRes.error || channelRes.error) {
      setMessage("Error saving: " + (profileRes.error?.message || channelRes.error?.message));
    } else {
      setMessage("Profile updated.");
    }
    setSaving(false);
  }

  if (loading) return <InlineLoader />;

  return (
    <div style={{ maxWidth: "500px" }}>
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
        fontSize: "12px",
        color: "#f59e0b",
        marginBottom: "8px",
        letterSpacing: "0.05em",
      }}>
        {">"} edit_profile
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
        color: "var(--text-primary)",
      }}>
        Edit Profile<span style={{ color: "#f59e0b" }}>_</span>
      </h1>

      <form
        onSubmit={handleSave}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderLeft: "3px solid #f59e0b",
          padding: "20px",
          borderRadius: "0px",
        }}
      >
        <Field label="Display Name" value={displayName} onChange={setDisplayName} />
        <Field label="Channel Name" value={channelName} onChange={setChannelName} />
        <Field label="Genres" value={genre} onChange={setGenre} placeholder="hip-hop, r&b, afrobeats" />

        <div>
          <label style={{
            display: "block",
            fontSize: "12px",
            color: "#52525b",
            marginBottom: "6px",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}>
            Bio
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={4}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: "#0a0a0a",
              border: "1px solid #27272a",
              borderRadius: "0px",
              color: "var(--text-primary)",
              fontSize: "14px",
              resize: "vertical",
              outline: "none",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>

        {message && (
          <p style={{
            fontSize: "13px",
            color: message.startsWith("Error") ? "#E24A4A" : "#4ADE80",
            fontFamily: "var(--font-mono)",
          }}>
            {message}
          </p>
        )}

        <button type="submit" disabled={saving} style={{
          padding: "12px",
          backgroundColor: "#f59e0b",
          color: "#0a0a0a",
          border: "none",
          borderRadius: "0px",
          fontSize: "11px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          cursor: saving ? "not-allowed" : "pointer",
          opacity: saving ? 0.6 : 1,
          fontFamily: "var(--font-mono)",
        }}>
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <label style={{
        display: "block",
        fontSize: "12px",
        color: "#52525b",
        marginBottom: "6px",
        fontFamily: "var(--font-mono)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#0a0a0a",
          border: "1px solid #27272a",
          borderRadius: "0px",
          color: "var(--text-primary)",
          fontSize: "14px",
          outline: "none",
          fontFamily: "var(--font-mono)",
        }}
      />
    </div>
  );
}

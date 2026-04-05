"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import InlineLoader from "@/app/components/InlineLoader";
import ManageBilling from "@/app/components/ManageBilling";
import { useRouter } from "next/navigation";

export default function AdvertiserProfile() {
  const supabase = createClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [displayName, setDisplayName] = useState("");
  const [originalDisplayName, setOriginalDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [nameChangedAt, setNameChangedAt] = useState<string | null>(null);

  const COOLDOWN_DAYS = 30;

  function getCooldownRemaining(changedAt: string | null): number {
    if (!changedAt) return 0;
    const changed = new Date(changedAt).getTime();
    const now = Date.now();
    const diff = COOLDOWN_DAYS * 86400000 - (now - changed);
    return diff > 0 ? Math.ceil(diff / 86400000) : 0;
  }

  const nameCooldown = getCooldownRemaining(nameChangedAt);
  const nameChanged = displayName !== originalDisplayName;

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return router.push("/login");

      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, bio, avatar_url, display_name_changed_at")
        .eq("id", user.id)
        .single();

      if (profile) {
        setDisplayName(profile.display_name);
        setOriginalDisplayName(profile.display_name);
        setBio(profile.bio || "");
        setAvatarUrl(profile.avatar_url || null);
        setNameChangedAt(profile.display_name_changed_at || null);
      }
      setLoading(false);
    }
    load();
  }, [supabase, router]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploadingAvatar(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      setMessage("Error uploading photo: " + uploadError.message);
      setUploadingAvatar(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now();

    await supabase.from("profiles").update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    setAvatarUrl(publicUrl);
    setUploadingAvatar(false);
    setMessage("Photo updated.");
    router.refresh();
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");

    if (nameChanged && nameCooldown > 0) {
      setMessage(`Error: Display name can only be changed every ${COOLDOWN_DAYS} days. ${nameCooldown} days remaining.`);
      setSaving(false);
      return;
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const updateData: Record<string, unknown> = {
      display_name: displayName,
      bio,
      updated_at: new Date().toISOString(),
    };
    if (nameChanged) {
      updateData.display_name_changed_at = new Date().toISOString();
    }

    const { error } = await supabase.from("profiles").update(updateData).eq("id", user.id);

    if (error) {
      setMessage("Error saving: " + error.message);
    } else {
      setMessage("Profile updated.");
      if (nameChanged) {
        setOriginalDisplayName(displayName);
        setNameChangedAt(new Date().toISOString());
      }
    }
    setSaving(false);
  }

  if (loading) return <InlineLoader />;

  const initials = displayName
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      width: "100vw",
      height: "100%",
      marginTop: "-24px",
      marginLeft: "calc(-50vw + 50%)",
      overflow: "hidden",
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

      {/* ── Fixed top zone ── */}
      <div style={{
        flexShrink: 0,
        padding: "24px 20px 16px",
        backgroundColor: "var(--bg-base)",
        borderBottom: "1px solid #27272a",
      }}>
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
          marginBottom: "16px",
          textTransform: "uppercase",
          letterSpacing: "-0.05em",
          color: "var(--text-primary)",
        }}>
          Edit Profile<span style={{ color: "#f59e0b" }}>_</span>
        </h1>

        {/* Avatar section */}
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          padding: "16px",
          backgroundColor: "rgba(24, 24, 27, 0.3)",
          borderLeft: "3px solid #f59e0b",
      }}>
        <div style={{
          width: "64px",
          height: "64px",
          borderRadius: "50%",
          border: "2px solid #3f3f46",
          backgroundColor: avatarUrl ? "transparent" : "#27272a",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={displayName} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: "20px", fontWeight: 700, color: "#a1a1aa", fontFamily: "var(--font-mono)" }}>
              {initials}
            </span>
          )}
        </div>
        <div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploadingAvatar}
            style={{
              padding: "8px 14px",
              backgroundColor: "transparent",
              border: "1px solid #f59e0b",
              color: "#f59e0b",
              borderRadius: "0px",
              cursor: uploadingAvatar ? "not-allowed" : "pointer",
              fontSize: "11px",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontFamily: "var(--font-mono)",
              opacity: uploadingAvatar ? 0.6 : 1,
            }}
          >
            {uploadingAvatar ? "Uploading..." : avatarUrl ? "Change Photo" : "Add Photo"}
          </button>
          <div style={{
            fontSize: "10px",
            color: "#52525b",
            marginTop: "6px",
            fontFamily: "var(--font-mono)",
            textTransform: "uppercase",
          }}>
            JPG, PNG — max 2MB
          </div>
        </div>
      </div>
      </div>{/* end fixed top zone */}

      {/* ── Scrollable content zone ── */}
      <div style={{
        flex: 1,
        overflowY: "auto",
        WebkitOverflowScrolling: "touch",
        padding: "16px 20px",
      }}>
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
        <div>
          <Field label="Display Name" value={displayName} onChange={setDisplayName} disabled={nameCooldown > 0} />
          {nameCooldown > 0 && (
            <p style={{
              fontSize: "10px", color: "#f59e0b", marginTop: "4px",
              fontFamily: "var(--font-mono)", textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              Locked for {nameCooldown} more day{nameCooldown !== 1 ? "s" : ""}
            </p>
          )}
        </div>

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
              textAlign: "center",
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

      <ManageBilling />

      </div>{/* end scrollable zone */}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, disabled }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean;
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
        disabled={disabled}
        style={{
          width: "100%",
          padding: "12px",
          backgroundColor: "#0a0a0a",
          border: `1px solid ${disabled ? "#3f3f46" : "#27272a"}`,
          borderRadius: "0px",
          color: disabled ? "#52525b" : "var(--text-primary)",
          fontSize: "14px",
          outline: "none",
          fontFamily: "var(--font-mono)",
          cursor: disabled ? "not-allowed" : undefined,
          opacity: disabled ? 0.6 : 1,
        }}
      />
    </div>
  );
}

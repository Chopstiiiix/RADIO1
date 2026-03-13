"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function AvatarMenu({
  avatarUrl,
  displayName,
  role,
  profileHref,
}: {
  avatarUrl: string | null;
  displayName: string;
  role: string;
  profileHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [currentAvatar, setCurrentAvatar] = useState(avatarUrl);
  const [uploading, setUploading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const supabase = createClient();

  const initials = displayName
    ?.split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase() || "?";

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleAvatarUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setUploading(false); return; }

    const ext = file.name.split(".").pop();
    const filePath = `${user.id}/avatar.${ext}`;

    // Upload to avatars bucket
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      console.error("Avatar upload failed:", uploadError.message);
      setUploading(false);
      return;
    }

    const { data: urlData } = supabase.storage.from("avatars").getPublicUrl(filePath);
    const publicUrl = urlData.publicUrl + "?t=" + Date.now(); // cache bust

    // Update profile
    await supabase.from("profiles").update({
      avatar_url: publicUrl,
      updated_at: new Date().toISOString(),
    }).eq("id", user.id);

    setCurrentAvatar(publicUrl);
    setUploading(false);
    router.refresh();
  }

  return (
    <div ref={menuRef} style={{ position: "relative" }}>
      {/* Avatar circle */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "32px",
          height: "32px",
          borderRadius: "50%",
          border: open ? "2px solid #f59e0b" : "2px solid #3f3f46",
          backgroundColor: currentAvatar ? "transparent" : "#27272a",
          cursor: "pointer",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          transition: "border-color 0.15s",
        }}
      >
        {currentAvatar ? (
          <img
            src={currentAvatar}
            alt={displayName}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        ) : (
          <span style={{
            fontSize: "11px",
            fontWeight: 700,
            color: "#a1a1aa",
            fontFamily: "var(--font-mono)",
            letterSpacing: "0.05em",
          }}>
            {initials}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {open && (
        <div style={{
          position: "absolute",
          top: "40px",
          right: 0,
          width: "200px",
          backgroundColor: "#18181b",
          border: "1px solid #27272a",
          borderRadius: "0px",
          zIndex: 100,
          overflow: "hidden",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          {/* User info header */}
          <div style={{
            padding: "12px 14px",
            borderBottom: "1px solid #27272a",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}>
            <div style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: "2px solid #3f3f46",
              backgroundColor: currentAvatar ? "transparent" : "#27272a",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}>
              {currentAvatar ? (
                <img
                  src={currentAvatar}
                  alt={displayName}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <span style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  color: "#a1a1aa",
                  fontFamily: "var(--font-mono)",
                }}>
                  {initials}
                </span>
              )}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}>
                {displayName}
              </div>
              <div style={{
                fontSize: "10px",
                color: "#f59e0b",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                fontFamily: "var(--font-mono)",
              }}>
                {role}
              </div>
            </div>
          </div>

          {/* Change photo */}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            onChange={handleAvatarUpload}
            style={{ display: "none" }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            style={{
              width: "100%",
              padding: "10px 14px",
              backgroundColor: "transparent",
              border: "none",
              borderBottom: "1px solid #27272a",
              color: uploading ? "#52525b" : "var(--text-secondary)",
              fontSize: "12px",
              textAlign: "left",
              cursor: uploading ? "not-allowed" : "pointer",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            {uploading ? "Uploading..." : currentAvatar ? "Change Photo" : "Add Photo"}
          </button>

          {/* Profile link */}
          <a
            href={profileHref}
            onClick={() => setOpen(false)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              padding: "10px 14px",
              backgroundColor: "transparent",
              color: "var(--text-secondary)",
              fontSize: "12px",
              textDecoration: "none",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              borderBottom: "1px solid #27272a",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Profile
          </a>

          {/* Sign out */}
          <form action="/api/auth/logout" method="POST" style={{ margin: 0 }}>
            <button type="submit" style={{
              width: "100%",
              padding: "10px 14px",
              backgroundColor: "transparent",
              border: "none",
              color: "#E24A4A",
              fontSize: "12px",
              textAlign: "left",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              Sign Out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

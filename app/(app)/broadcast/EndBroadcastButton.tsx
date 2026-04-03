"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function EndBroadcastButton() {
  const [ending, setEnding] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setUserId(user.id);
    });
  }, []);

  async function handleEnd() {
    if (!confirm("End your broadcast?")) return;
    setEnding(true);

    try {
      const res = await fetch("/api/broadcast", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", broadcaster_id: userId }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch {
      // ignore
    }
    setEnding(false);
  }

  return (
    <button
      onClick={handleEnd}
      disabled={ending}
      style={{
        flex: 1,
        padding: "12px 20px",
        backgroundColor: "transparent",
        border: "1px solid #E24A4A",
        color: "#E24A4A",
        fontSize: "11px",
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.05em",
        cursor: ending ? "not-allowed" : "pointer",
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        opacity: ending ? 0.6 : 1,
        transition: "all 0.15s",
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none">
        <rect x="4" y="4" width="16" height="16" rx="1" />
      </svg>
      {ending ? "ENDING..." : "END BROADCAST"}
    </button>
  );
}

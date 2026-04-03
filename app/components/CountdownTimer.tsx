"use client";

import { useState, useEffect } from "react";

export default function CountdownTimer({ scheduledAt }: { scheduledAt: string }) {
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    function update() {
      const now = Date.now();
      const target = new Date(scheduledAt).getTime();
      const diff = target - now;

      if (diff <= 0) {
        setRemaining("STARTING...");
        return;
      }

      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);

      if (days > 0) {
        setRemaining(`${days}d ${hours}h ${mins}m`);
      } else if (hours > 0) {
        setRemaining(`${hours}h ${mins}m ${secs}s`);
      } else {
        setRemaining(`${mins}m ${secs}s`);
      }
    }

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [scheduledAt]);

  return (
    <span style={{
      fontSize: "10px",
      fontFamily: "var(--font-mono)",
      letterSpacing: "0.05em",
      color: "#f59e0b",
    }}>
      {remaining}
    </span>
  );
}

"use client";

import { useState } from "react";

interface ScheduleModalProps {
  onSchedule: (scheduledAt: string) => void;
  onCancel: () => void;
  trackCount: number;
}

export default function ScheduleModal({ onSchedule, onCancel, trackCount }: ScheduleModalProps) {
  const now = new Date();
  const [date, setDate] = useState(now.toISOString().split("T")[0]);
  const [hour, setHour] = useState(String(now.getHours()).padStart(2, "0"));
  const [minute, setMinute] = useState("00");
  const [error, setError] = useState("");

  function handleSchedule() {
    const scheduled = new Date(`${date}T${hour}:${minute}:00`);
    if (scheduled <= new Date()) {
      setError("Scheduled time must be in the future");
      return;
    }
    onSchedule(scheduled.toISOString());
  }

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      backgroundColor: "rgba(0, 0, 0, 0.85)",
      zIndex: 1000,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "20px",
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{
        width: "100%",
        maxWidth: "400px",
        backgroundColor: "#18181b",
        border: "1px solid #27272a",
      }}>
        {/* Header */}
        <div style={{
          padding: "20px",
          borderBottom: "1px solid #27272a",
        }}>
          <div style={{
            fontSize: "10px",
            color: "#f59e0b",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "8px",
          }}>
            {"// SCHEDULE_BROADCAST"}
          </div>
          <h2 style={{
            fontSize: "18px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "-0.03em",
          }}>
            Schedule Broadcast<span style={{ color: "#f59e0b" }}>_</span>
          </h2>
          <p style={{
            fontSize: "11px",
            color: "#71717a",
            marginTop: "6px",
            lineHeight: 1.5,
          }}>
            Set when to auto-broadcast {trackCount} track{trackCount !== 1 ? "s" : ""}.
          </p>
        </div>

        {/* Date/Time picker */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Date */}
          <div>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={date}
              min={now.toISOString().split("T")[0]}
              onChange={(e) => { setDate(e.target.value); setError(""); }}
              style={inputStyle}
            />
          </div>

          {/* Time */}
          <div style={{ display: "flex", gap: "12px" }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Hour</label>
              <select
                value={hour}
                onChange={(e) => { setHour(e.target.value); setError(""); }}
                style={inputStyle}
              >
                {Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0")).map((h) => (
                  <option key={h} value={h}>{h}</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Minute</label>
              <select
                value={minute}
                onChange={(e) => { setMinute(e.target.value); setError(""); }}
                style={inputStyle}
              >
                {["00", "15", "30", "45"].map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Preview */}
          <div style={{
            padding: "12px",
            backgroundColor: "rgba(245, 158, 11, 0.05)",
            borderLeft: "3px solid #f59e0b",
            fontSize: "12px",
            color: "#f59e0b",
            fontFamily: "var(--font-mono)",
          }}>
            {(() => {
              const d = new Date(`${date}T${hour}:${minute}:00`);
              return d.toLocaleString("en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              });
            })()}
          </div>

          {error && (
            <p style={{ fontSize: "11px", color: "#E24A4A", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: "16px 20px",
          borderTop: "1px solid #27272a",
          display: "flex",
          gap: "8px",
        }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "transparent",
              border: "1px solid #f59e0b",
              color: "#f59e0b",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSchedule}
            style={{
              flex: 1,
              padding: "12px",
              backgroundColor: "#4ADE80",
              border: "1px solid #4ADE80",
              color: "#0a0a0a",
              fontSize: "11px",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              cursor: "pointer",
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            Schedule
          </button>
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
  fontFamily: "var(--font-mono)",
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
  fontSize: "16px",
  outline: "none",
  fontFamily: "var(--font-mono)",
  boxSizing: "border-box",
};

"use client";

export default function Header({ isLive, channelName }: { isLive: boolean; channelName?: string }) {
  return (
    <header
      style={{
        padding: "24px 20px",
        borderBottom: "1px solid var(--border-subtle)",
        backgroundColor: "var(--bg-base)",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      {/* System status bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: "var(--font-mono)",
          fontSize: "10px",
          color: "var(--text-tertiary)",
          letterSpacing: "0.5px",
          textTransform: "uppercase",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "6px",
              height: "6px",
              backgroundColor: isLive ? "#E24A4A" : "var(--text-tertiary)",
              borderRadius: "50%",
              boxShadow: isLive ? "0 0 8px rgba(226, 74, 74, 0.6)" : "none",
              animation: isLive ? "pulse 2s infinite" : "none",
            }}
          />
          <span>{isLive ? "ON AIR" : "OFFLINE"} // CH-01</span>
        </div>
        <span>FLAC // 44.1kHz</span>
      </div>

      {/* Station title */}
      <h1
        style={{
          fontSize: "32px",
          fontWeight: 700,
          letterSpacing: "-1px",
          lineHeight: 1,
          color: "var(--text-primary)",
        }}
      >
        {channelName ?? "Caster"}
      </h1>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </header>
  );
}

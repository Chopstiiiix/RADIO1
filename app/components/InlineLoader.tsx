"use client";

export default function InlineLoader() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "48px 0",
      fontFamily: "'JetBrains Mono', monospace",
      gap: "14px",
    }}>
      <style>{`
        @keyframes loader-slide {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes pulse-opacity {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
        .inline-loader-blink {
          animation: pulse-opacity 1s step-end infinite;
        }
      `}</style>

      <div style={{
        width: "100px",
        height: "2px",
        backgroundColor: "#27272a",
        overflow: "hidden",
        borderRadius: "1px",
      }}>
        <div style={{
          width: "40%",
          height: "100%",
          backgroundColor: "#f59e0b",
          animation: "loader-slide 1s ease-in-out infinite",
        }} />
      </div>

      <div style={{
        fontSize: "11px",
        color: "#f59e0b",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        display: "flex",
        alignItems: "center",
        gap: "6px",
      }}>
        <span>&gt;</span>
        <span>loading</span>
        <span className="inline-loader-blink" style={{
          width: "8px",
          height: "12px",
          backgroundColor: "#f59e0b",
          display: "inline-block",
        }} />
      </div>
    </div>
  );
}

"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{
        backgroundColor: "#202020",
        color: "#F0F0F0",
        fontFamily: "'JetBrains Mono', monospace",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        gap: "16px",
      }}>
        <h1 style={{ fontSize: "36px", fontWeight: 800, letterSpacing: "-0.05em", textTransform: "uppercase" }}>
          Caster<span style={{ color: "#f59e0b" }}>_</span>
        </h1>
        <p style={{ fontSize: "12px", color: "#71717a", textTransform: "uppercase", letterSpacing: "0.1em" }}>
          {">"} error: something went wrong
        </p>
        <p style={{ fontSize: "10px", color: "#E24A4A", maxWidth: "340px", textAlign: "center", wordBreak: "break-all", padding: "0 16px" }}>
          {error?.message || "No error message"}
        </p>
        <p style={{ fontSize: "9px", color: "#52525b", maxWidth: "340px", textAlign: "center", wordBreak: "break-all", padding: "0 16px" }}>
          {error?.digest || ""}
        </p>
        <button
          onClick={reset}
          style={{
            padding: "12px 24px",
            backgroundColor: "#f59e0b",
            color: "#0a0a0a",
            border: "none",
            fontSize: "11px",
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            cursor: "pointer",
            fontFamily: "'JetBrains Mono', monospace",
          }}
        >
          Retry
        </button>
      </body>
    </html>
  );
}

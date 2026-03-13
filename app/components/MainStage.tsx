"use client";

import type { TrackInfo } from "./NowPlaying";
import type { UpcomingTrack } from "./Schedule";
import Visualizer from "./Visualizer";

interface MainStageProps {
  track: TrackInfo | null;
  upcoming: UpcomingTrack[];
  analyserNode: AnalyserNode | null;
  isPlaying: boolean;
}

export default function MainStage({ track, upcoming, analyserNode, isPlaying }: MainStageProps) {
  const nextTrack = upcoming[0];

  return (
    <main
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--bg-well)",
        position: "relative",
      }}
    >
      {/* Track metadata */}
      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          zIndex: 10,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            marginBottom: "6px",
            letterSpacing: "0.5px",
          }}
        >
          Currently Playing
        </div>
        <h2
          style={{
            fontSize: "28px",
            fontWeight: 600,
            letterSpacing: "-0.5px",
            color: "var(--text-primary)",
          }}
        >
          {track?.title ?? "Waiting for stream..."}
        </h2>
        <h3
          style={{
            fontSize: "18px",
            fontWeight: 400,
            color: "var(--text-secondary)",
          }}
        >
          {track?.artist ?? "—"}
        </h3>
      </div>

      {/* Upcoming block */}
      {nextTrack && (
        <div
          style={{
            margin: "20px",
            padding: "12px 16px",
            backgroundColor: "var(--bg-highlight)",
            borderLeft: "3px solid var(--accent-blue)",
            fontSize: "13px",
            lineHeight: 1.5,
            color: "var(--text-primary)",
            display: "inline-block",
            alignSelf: "flex-start",
            zIndex: 10,
            maxWidth: "80%",
          }}
        >
          Next in queue: <br />
          <span style={{ color: "var(--text-accent)", fontWeight: 500 }}>
            {nextTrack.title}
          </span>{" "}
          — {nextTrack.artist}
        </div>
      )}

      {/* Waveform visualizer */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100%",
          height: "60%",
          opacity: 0.8,
          pointerEvents: "none",
          maskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
          WebkitMaskImage: "linear-gradient(to bottom, transparent 0%, black 40%)",
        }}
      >
        <Visualizer analyserNode={analyserNode} isPlaying={isPlaying} />
      </div>
    </main>
  );
}

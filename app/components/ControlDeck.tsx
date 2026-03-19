"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

interface ControlDeckProps {
  isPlaying: boolean;
  onToggle: () => void;
  onSkipNext: () => void;
  onSkipPrev: () => void;
  elapsed: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onVolumeChange: (v: number) => void;
  ended: boolean;
}

function formatTimecode(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function IconButton({
  onClick,
  label,
  children,
  size = 24,
  disabled = false,
}: {
  onClick?: () => void;
  label: string;
  children: React.ReactNode;
  size?: number;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="btn-icon"
      disabled={disabled}
      style={{
        "--icon-size": `${size}px`,
        opacity: disabled ? 0.3 : 1,
        cursor: disabled ? "default" : "pointer",
      } as React.CSSProperties}
    >
      {children}
    </button>
  );
}

export default function ControlDeck({
  isPlaying,
  onToggle,
  onSkipNext,
  onSkipPrev,
  elapsed,
  duration,
  volume,
  isMuted,
  onToggleMute,
  onVolumeChange,
  ended,
}: ControlDeckProps) {
  const [liked, setLiked] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const playheadRef = useRef<HTMLDivElement>(null);

  // Progress capped at 100%
  const progress = duration > 0 ? Math.min((elapsed / duration) * 100, 100) : 0;

  // Dynamic ruler labels based on track duration
  const rulerLabels = useMemo(() => {
    if (duration <= 0) return ["0:00"];
    const totalMin = Math.ceil(duration / 60);
    const labels: string[] = [];
    // Show a label roughly every minute, up to 5 labels
    const step = Math.max(1, Math.ceil(totalMin / 4));
    for (let m = 0; m <= totalMin; m += step) {
      labels.push(`${m}:00`);
    }
    // Always include the final duration
    const lastLabel = formatTimecode(duration);
    if (labels[labels.length - 1] !== lastLabel) {
      labels.push(lastLabel);
    }
    return labels;
  }, [duration]);

  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.left = `${progress}%`;
    }
  }, [progress]);

  const handleLike = useCallback(() => {
    setLiked((prev) => !prev);
  }, []);

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    const text = "Listening live on Caster";
    if (navigator.share) {
      try {
        await navigator.share({ title: "Caster", text, url });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      setShowShare(true);
      setTimeout(() => setShowShare(false), 2000);
    }
  }, []);

  const effectiveVolume = isMuted ? 0 : volume;

  return (
    <footer className="control-deck">
      <style>{`
        .control-deck {
          background-color: var(--bg-panel);
          border-top: 1px solid var(--border-strong);
          padding-bottom: env(safe-area-inset-bottom, 20px);
        }
        .btn-icon {
          background: none;
          border: none;
          padding: 12px;
          cursor: pointer;
          color: var(--text-secondary);
          display: flex;
          align-items: center;
          justify-content: center;
          transition: color 0.15s ease, transform 0.1s ease;
          -webkit-tap-highlight-color: transparent;
          position: relative;
        }
        .btn-icon:hover:not(:disabled) { color: var(--text-primary); }
        .btn-icon:active:not(:disabled) { color: var(--text-primary); transform: scale(0.9); }
        .btn-icon svg {
          width: var(--icon-size, 24px);
          height: var(--icon-size, 24px);
          stroke: currentColor;
          stroke-width: 1.5;
          stroke-linecap: round;
          stroke-linejoin: round;
          fill: none;
        }
        .btn-icon.liked { color: #E24A4A; }
        .btn-icon.liked:hover { color: #ff6b6b; }
        .btn-icon.liked svg { fill: currentColor; }
        .btn-play svg {
          width: 32px !important;
          height: 32px !important;
          fill: currentColor;
          stroke: none;
        }
        .volume-slider {
          -webkit-appearance: none;
          appearance: none;
          width: 80px;
          height: 4px;
          border-radius: 2px;
          background: var(--border-subtle);
          outline: none;
          cursor: pointer;
        }
        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent-blue);
          cursor: pointer;
        }
        .volume-slider::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: var(--accent-blue);
          cursor: pointer;
          border: none;
        }
        .share-toast {
          position: absolute;
          top: -32px;
          left: 50%;
          transform: translateX(-50%);
          background: var(--bg-highlight);
          color: var(--text-accent);
          font-family: var(--font-mono);
          font-size: 10px;
          padding: 4px 10px;
          border-radius: 4px;
          white-space: nowrap;
          pointer-events: none;
          animation: fadeInOut 2s ease;
        }
        @keyframes fadeInOut {
          0% { opacity: 0; transform: translateX(-50%) translateY(4px); }
          15% { opacity: 1; transform: translateX(-50%) translateY(0); }
          85% { opacity: 1; }
          100% { opacity: 0; }
        }
      `}</style>

      {/* Timeline */}
      <div style={{ padding: "24px 0 16px 0", display: "flex", flexDirection: "column", alignItems: "center" }}>
        {/* Timecode */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            fontFamily: "var(--font-mono)",
            fontSize: "16px",
            fontWeight: 500,
            marginBottom: "24px",
          }}
        >
          {ended ? (
            <span style={{ color: "var(--text-tertiary)" }}>ENDED</span>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={isPlaying ? "var(--accent-blue)" : "var(--text-tertiary)"}>
                <path d="M6 4l15 8-15 8z" />
              </svg>
              <span style={{ color: "var(--text-primary)" }}>{formatTimecode(elapsed)}</span>
              <span style={{ color: "var(--text-tertiary)" }}>/ {formatTimecode(duration)}</span>
            </>
          )}
        </div>

        {/* Ruler */}
        <div
          style={{
            width: "100%",
            height: "30px",
            position: "relative",
            backgroundImage: `
              repeating-linear-gradient(to right, transparent, transparent 19px, var(--border-subtle) 19px, var(--border-subtle) 20px),
              repeating-linear-gradient(to right, transparent, transparent 99px, var(--text-tertiary) 99px, var(--text-tertiary) 100px)
            `,
            backgroundPosition: "0 bottom",
            backgroundSize: "100% 6px, 100% 12px",
            backgroundRepeat: "no-repeat",
          }}
        >
          {/* Playhead */}
          <div
            ref={playheadRef}
            style={{
              position: "absolute",
              top: "-4px",
              left: `${progress}%`,
              width: "2px",
              height: "calc(100% + 4px)",
              backgroundColor: ended ? "var(--text-tertiary)" : "var(--accent-blue)",
              transform: "translateX(-50%)",
              zIndex: 20,
              transition: "left 1s linear",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: 0,
                left: "50%",
                transform: "translateX(-50%)",
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: `6px solid ${ended ? "var(--text-tertiary)" : "var(--accent-blue)"}`,
              }}
            />
          </div>
        </div>

        {/* Ruler numbers — dynamic based on duration */}
        <div
          style={{
            width: "100%",
            display: "flex",
            justifyContent: "space-between",
            padding: "0 10px",
            fontFamily: "var(--font-mono)",
            fontSize: "10px",
            color: "var(--text-tertiary)",
            marginTop: "4px",
          }}
        >
          {rulerLabels.map((label, i) => (
            <span key={i}>{label}</span>
          ))}
        </div>
      </div>

      {/* Transport */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 20px 24px" }}>
        {/* Left: Like + Volume */}
        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          <IconButton onClick={handleLike} label={liked ? "Unlike" : "Like"}>
            <span className={liked ? "btn-icon liked" : ""} style={{ display: "contents" }}>
              <svg viewBox="0 0 24 24" style={liked ? { fill: "currentColor" } : undefined}>
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </span>
          </IconButton>

          <IconButton onClick={onToggleMute} label={isMuted ? "Unmute" : "Mute"}>
            <svg viewBox="0 0 24 24">
              {effectiveVolume === 0 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <line x1="23" y1="9" x2="17" y2="15" />
                  <line x1="17" y1="9" x2="23" y2="15" />
                </>
              ) : effectiveVolume < 0.5 ? (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              ) : (
                <>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
            </svg>
          </IconButton>

          <input
            type="range"
            className="volume-slider"
            min="0" max="1" step="0.05"
            value={effectiveVolume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            aria-label="Volume"
          />
        </div>

        {/* Center: Transport */}
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <IconButton onClick={onSkipPrev} label="Previous" disabled={ended}>
            <svg viewBox="0 0 24 24">
              <polygon points="19 20 9 12 19 4 19 20" />
              <line x1="5" y1="19" x2="5" y2="5" />
            </svg>
          </IconButton>

          <IconButton onClick={onToggle} label={isPlaying ? "Pause" : "Play"} size={32} disabled={ended}>
            <svg viewBox="0 0 24 24" className="btn-play" style={{ fill: "currentColor", stroke: "none" }}>
              {isPlaying ? (
                <>
                  <rect x="6" y="4" width="4" height="16" />
                  <rect x="14" y="4" width="4" height="16" />
                </>
              ) : (
                <path d="M6 4l15 8-15 8z" />
              )}
            </svg>
          </IconButton>

          <IconButton onClick={onSkipNext} label="Next" disabled={ended}>
            <svg viewBox="0 0 24 24">
              <polygon points="5 4 15 12 5 20 5 4" />
              <line x1="19" y1="5" x2="19" y2="19" />
            </svg>
          </IconButton>
        </div>

        {/* Right: Share */}
        <div style={{ position: "relative" }}>
          {showShare && <div className="share-toast">LINK COPIED</div>}
          <IconButton onClick={handleShare} label="Share">
            <svg viewBox="0 0 24 24">
              <circle cx="18" cy="5" r="3" />
              <circle cx="6" cy="12" r="3" />
              <circle cx="18" cy="19" r="3" />
              <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
              <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
            </svg>
          </IconButton>
        </div>
      </div>
    </footer>
  );
}

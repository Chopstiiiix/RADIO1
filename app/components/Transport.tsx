"use client";

import { hapticTap } from "../../lib/capacitor-bridge";

interface TransportProps {
  isPlaying: boolean;
  onToggle: () => void;
}

export default function Transport({ isPlaying, onToggle }: TransportProps) {
  const handleToggle = () => {
    hapticTap();
    onToggle();
  };

  return (
    <div className="flex items-center justify-center gap-6">
      <button
        onClick={handleToggle}
        className="w-14 h-14 rounded-full bg-accent hover:bg-accent/80 transition-colors flex items-center justify-center"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? (
          <svg className="w-6 h-6 text-well" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
          </svg>
        ) : (
          <svg className="w-6 h-6 text-well ml-1" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
    </div>
  );
}

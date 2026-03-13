"use client";

export interface TrackInfo {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  duration?: number;
  elapsed?: number;
}

export default function NowPlaying({ track }: { track: TrackInfo | null }) {
  return (
    <div className="flex items-center gap-4">
      {/* Album art */}
      <div className="w-16 h-16 rounded-lg bg-well flex items-center justify-center overflow-hidden shrink-0">
        {track?.artwork ? (
          <img
            src={track.artwork}
            alt={track.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <svg className="w-8 h-8 text-secondary" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        )}
      </div>

      {/* Track info */}
      <div className="min-w-0">
        <p className="text-sm font-semibold text-primary truncate">
          {track?.title ?? "Waiting for stream..."}
        </p>
        <p className="text-xs text-secondary truncate">
          {track?.artist ?? "—"}
        </p>
        {track?.album && (
          <p className="text-xs text-secondary/60 truncate">{track.album}</p>
        )}
      </div>
    </div>
  );
}

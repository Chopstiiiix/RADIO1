"use client";

export interface UpcomingTrack {
  title: string;
  artist: string;
  startTime?: string;
}

export default function Schedule({ upcoming }: { upcoming: UpcomingTrack[] }) {
  if (!upcoming.length) return null;

  return (
    <div className="bg-panel rounded-xl p-4 border border-white/5">
      <h2 className="text-xs font-mono text-secondary uppercase tracking-widest mb-3">
        Up Next
      </h2>
      <ul className="space-y-2">
        {upcoming.map((track, i) => (
          <li key={i} className="flex items-center gap-3 text-sm">
            <span className="text-xs font-mono text-secondary w-6">
              {String(i + 1).padStart(2, "0")}
            </span>
            <span className="text-primary truncate">{track.title}</span>
            <span className="text-secondary text-xs truncate ml-auto">
              {track.artist}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

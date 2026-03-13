import fs from "fs";
import path from "path";
import { updateChannelNowPlaying } from "./metadata-server";
import type { ChannelConfig, TrackFile } from "./stream";
import { streamEvents } from "./stream";
import { supabase } from "./supabase";

interface Track {
  title: string;
  artist: string;
  file: string;
  duration: number;
  startOffset: number;
}

interface ChannelSchedulerState {
  playlist: Track[];
  currentTrackIndex: number;
  pollTimer: ReturnType<typeof setInterval> | null;
}

const channelSchedulers = new Map<string, ChannelSchedulerState>();

// DB metadata cache: filename -> { title, artist }
const dbMetadataCache = new Map<string, { title: string; artist: string }>();

async function loadDbMetadata(broadcasterId?: string) {
  if (!broadcasterId) return;
  const { data } = await supabase
    .from("tracks")
    .select("title, primary_artist, file_url")
    .eq("broadcaster_id", broadcasterId)
    .eq("is_active", true);

  if (data) {
    for (const t of data) {
      // Match by title (case-insensitive) since local filenames may differ
      dbMetadataCache.set(t.title.toUpperCase(), { title: t.title, artist: t.primary_artist });
      // Also try to extract filename from file_url
      if (t.file_url) {
        const urlName = t.file_url.split("/").pop()?.replace(/\.(mp3|flac|wav|m4a|ogg)$/i, "") || "";
        dbMetadataCache.set(urlName.toUpperCase(), { title: t.title, artist: t.primary_artist });
      }
    }
  }
}

function parseTrackFromFile(tf: TrackFile, startOffset: number): Track {
  const name = tf.filename.replace(/\.(mp3|flac|wav|m4a|ogg)$/i, "");
  const base = { file: tf.filename, duration: tf.duration, startOffset };

  // Try DB metadata first
  const dbMatch = dbMetadataCache.get(name.toUpperCase());
  if (dbMatch) {
    return { ...base, artist: dbMatch.artist, title: dbMatch.title };
  }

  // Fallback: parse "Artist - Title" from filename
  const parts = name.split(" - ");
  if (parts.length >= 2) {
    return { ...base, artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { ...base, artist: "Unknown Artist", title: name.trim() };
}

function getTotalEncodedTime(outputDir: string): number {
  const m3u8Path = path.join(outputDir, "stream.m3u8");
  if (!fs.existsSync(m3u8Path)) return 0;

  const content = fs.readFileSync(m3u8Path, "utf-8");
  let total = 0;
  for (const line of content.split("\n")) {
    if (line.startsWith("#EXTINF:")) {
      const dur = parseFloat(line.replace("#EXTINF:", "").replace(",", ""));
      if (!isNaN(dur)) total += dur;
    }
  }
  return total;
}

function getTrackIndexAtTime(playlist: Track[], encodedTime: number): number {
  for (let i = 0; i < playlist.length; i++) {
    const trackEnd = playlist[i].startOffset + playlist[i].duration;
    if (encodedTime < trackEnd) return i;
  }
  return -1;
}

function broadcastTrack(slug: string, playlist: Track[], index: number) {
  if (index < 0 || index >= playlist.length) {
    broadcastEnded(slug);
    return;
  }

  const current = playlist[index];
  const upcoming: { title: string; artist: string }[] = [];
  for (let i = index + 1; i < playlist.length && upcoming.length < 3; i++) {
    upcoming.push({ title: playlist[i].title, artist: playlist[i].artist });
  }

  console.log(`🎶 [${slug}] Now playing: ${current.title} — ${current.artist} (${Math.round(current.duration)}s)`);

  updateChannelNowPlaying(slug, {
    track: { title: current.title, artist: current.artist },
    upcoming,
    duration: Math.round(current.duration),
    trackStartOffset: current.startOffset,
    ended: false,
  });
}

function broadcastEnded(slug: string) {
  console.log(`⏹️  [${slug}] All tracks finished. Stream ended.`);
  const state = channelSchedulers.get(slug);
  if (state?.pollTimer) {
    clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
  updateChannelNowPlaying(slug, {
    track: { title: "Broadcast ended", artist: "All tracks played" },
    upcoming: [],
    duration: 0,
    trackStartOffset: 0,
    ended: true,
  });
}

export async function startChannelScheduler(config: ChannelConfig, trackFiles: TrackFile[], broadcasterId?: string) {
  const { slug, outputDir } = config;

  // Load metadata from DB for better track info
  await loadDbMetadata(broadcasterId);

  // Build playlist with cumulative start offsets
  let offset = 0;
  const playlist = trackFiles.map((tf) => {
    const track = parseTrackFromFile(tf, offset);
    offset += tf.duration;
    return track;
  });

  console.log(`📋 [${slug}] Loaded ${playlist.length} tracks into playlist`);
  const totalSec = offset;
  console.log(`⏱️  [${slug}] Total runtime: ${Math.floor(totalSec / 60)}m ${Math.round(totalSec % 60)}s`);

  if (playlist.length === 0) {
    updateChannelNowPlaying(slug, {
      track: { title: "No tracks loaded", artist: "Upload tracks to go live" },
      upcoming: [],
      duration: 0,
      trackStartOffset: 0,
      ended: false,
    });
    return;
  }

  const state: ChannelSchedulerState = {
    playlist,
    currentTrackIndex: 0,
    pollTimer: null,
  };

  // Initial broadcast
  broadcastTrack(slug, playlist, 0);

  // Poll m3u8 every second
  state.pollTimer = setInterval(() => {
    const encodedTime = getTotalEncodedTime(outputDir);
    const trackIndex = getTrackIndexAtTime(playlist, encodedTime);

    if (trackIndex === -1) {
      if (state.currentTrackIndex !== -1) {
        state.currentTrackIndex = -1;
        broadcastEnded(slug);
      }
    } else if (trackIndex !== state.currentTrackIndex) {
      state.currentTrackIndex = trackIndex;
      broadcastTrack(slug, playlist, trackIndex);
    }
  }, 1000);

  channelSchedulers.set(slug, state);
  console.log(`⏰ [${slug}] Scheduler started`);

  // Listen for stream end
  streamEvents.on("ended", (endedSlug: string) => {
    if (endedSlug === slug) {
      broadcastEnded(slug);
    }
  });
}

export function stopChannelScheduler(slug: string) {
  const state = channelSchedulers.get(slug);
  if (state?.pollTimer) {
    clearInterval(state.pollTimer);
  }
  channelSchedulers.delete(slug);
}

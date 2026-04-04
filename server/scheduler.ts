import fs from "fs";
import path from "path";
import { updateChannelNowPlaying } from "./metadata-server";
import type { ChannelConfig, TrackFile } from "./stream";
import { streamEvents } from "./stream";
import { supabase } from "./supabase";

interface Track {
  title: string;
  artist: string;
  artwork_url?: string;
  file: string;
  duration: number;
  startOffset: number;
  type: "track" | "host_segment" | "advert";
}

interface ChannelSchedulerState {
  playlist: Track[];
  currentTrackIndex: number;
  pollTimer: ReturnType<typeof setInterval> | null;
}

const channelSchedulers = new Map<string, ChannelSchedulerState>();

// DB metadata cache: filename -> { title, artist }
export const dbMetadataCache = new Map<string, { title: string; artist: string; artwork_url?: string }>();

export async function loadDbMetadata(broadcasterId?: string) {
  if (!broadcasterId) return;
  const { data } = await supabase
    .from("tracks")
    .select("title, primary_artist, file_url, artwork_url")
    .eq("broadcaster_id", broadcasterId)
    .eq("is_active", true);

  if (data) {
    for (const t of data) {
      const meta = { title: t.title, artist: t.primary_artist, artwork_url: t.artwork_url || undefined };
      // Match by title (case-insensitive) since local filenames may differ
      dbMetadataCache.set(t.title.toUpperCase(), meta);
      // Also try to extract filename from file_url
      if (t.file_url) {
        const urlName = t.file_url.split("/").pop()?.replace(/\.(mp3|flac|wav|m4a|ogg)$/i, "") || "";
        dbMetadataCache.set(urlName.toUpperCase(), meta);
      }
    }
  }
}

function parseTrackFromFile(tf: TrackFile, startOffset: number): Track {
  const name = tf.filename.replace(/\.(mp3|flac|wav|m4a|ogg)$/i, "");
  const base = { file: tf.filename, duration: tf.duration, startOffset };

  // Detect host segments (files from _host_segments directory or tagged filenames)
  const isHostSegment = tf.path.includes("_host_segments") || tf.filename.startsWith("HOST__");
  if (isHostSegment) {
    // Extract speaker names from tagged filename: HOST__Adam__Eve__1234_track_intro.mp3
    let hostNames = "AI Host";
    if (tf.filename.startsWith("HOST__")) {
      const parts = tf.filename.replace(/^HOST__/, "").split("__");
      // Last part is the original filename (timestamp_type.mp3), everything before is speaker names
      const speakers = parts.slice(0, -1);
      if (speakers.length > 0) {
        hostNames = speakers.length === 1 ? speakers[0] : speakers.slice(0, -1).join(", ") + " & " + speakers[speakers.length - 1];
      }
    }
    return { ...base, artist: hostNames, title: hostNames, type: "host_segment" };
  }

  // Try DB metadata first
  const dbMatch = dbMetadataCache.get(name.toUpperCase());
  if (dbMatch) {
    return { ...base, artist: dbMatch.artist, title: dbMatch.title, artwork_url: dbMatch.artwork_url, type: "track" };
  }

  // Fallback: parse "Artist - Title" from filename
  const parts = name.split(" - ");
  if (parts.length >= 2) {
    return { ...base, artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim(), type: "track" };
  }
  return { ...base, artist: "Unknown Artist", title: name.trim(), type: "track" };
}

// HLS latency: hls_time(1s) * liveSyncDurationCount(2) = ~2s
// The encoded time in m3u8 runs ahead of what listeners actually hear.
// Subtract this to sync metadata with actual playback.
const HLS_LATENCY_OFFSET = 2;

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

  // Adjust for HLS playback latency — listeners are behind the encode head
  return Math.max(0, total - HLS_LATENCY_OFFSET);
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
  // Filter upcoming to only show actual tracks (not host segments)
  const upcoming: { title: string; artist: string }[] = [];
  for (let i = index + 1; i < playlist.length && upcoming.length < 3; i++) {
    if (playlist[i].type !== "host_segment") {
      upcoming.push({ title: playlist[i].title, artist: playlist[i].artist });
    }
  }

  const typeEmoji = current.type === "host_segment" ? "🎙️" : "🎶";
  console.log(`${typeEmoji} [${slug}] Now playing: ${current.title} — ${current.artist} (${Math.round(current.duration)}s)`);

  updateChannelNowPlaying(slug, {
    track: { title: current.title, artist: current.artist, artwork_url: current.artwork_url },
    upcoming,
    duration: Math.round(current.duration),
    trackStartOffset: current.startOffset,
    ended: false,
    type: current.type,
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

  // Poll m3u8 every 500ms for tight sync
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
  }, 500);

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

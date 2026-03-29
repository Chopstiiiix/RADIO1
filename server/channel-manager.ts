import fs from "fs";
import path from "path";
import { supabase } from "./supabase";
import { startChannelPipeline, stopChannelPipeline, startChannelPipelineFromTracks, getChannelTracks, streamEvents, type ChannelConfig, type TrackFile } from "./stream";
import { startChannelScheduler, stopChannelScheduler } from "./scheduler";
import { syncTracksForChannel } from "./track-sync";
import { pregenerateHostSegments, isAiHostEnabled, getBroadcasterAgents, type GeneratedSegment } from "./react-agent";

const BASE_MUSIC_DIR = path.join(process.cwd(), "music");
const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");

interface ActiveChannel {
  config: ChannelConfig;
  broadcasterId: string;
  useAiHost?: boolean;
}

const activeChannels = new Map<string, ActiveChannel>();

export function getActiveChannels() {
  return activeChannels;
}

export async function startChannel(broadcasterId: string, slug: string, trackIds?: string[], useAiHost?: boolean): Promise<boolean> {
  if (activeChannels.has(slug)) {
    console.log(`Channel ${slug} already active`);
    return true;
  }

  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(musicDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // Clear old files so only selected tracks play
  if (fs.existsSync(musicDir)) {
    for (const f of fs.readdirSync(musicDir)) {
      if (/\.(mp3|flac|wav|m4a|ogg)$/i.test(f)) {
        fs.unlinkSync(path.join(musicDir, f));
      }
    }
  }

  // Clean old host segments
  const segmentDir = path.join(musicDir, "_host_segments");
  if (fs.existsSync(segmentDir)) {
    for (const f of fs.readdirSync(segmentDir)) {
      fs.unlinkSync(path.join(segmentDir, f));
    }
  }

  // Sync selected tracks from Supabase Storage to local music dir
  await syncTracksForChannel(broadcasterId, slug, musicDir, trackIds);

  const config: ChannelConfig = { slug, musicDir, outputDir };

  // Get base tracks
  let baseTracks = getChannelTracks(musicDir);
  if (baseTracks.length === 0) {
    console.log(`No tracks for channel ${slug} — cannot go live`);
    return false;
  }

  // Determine if AI host should be used
  const shouldUseAiHost = useAiHost ?? await isAiHostEnabled(broadcasterId);

  let finalTracks = baseTracks;
  if (shouldUseAiHost) {
    try {
      const agents = await getBroadcasterAgents(broadcasterId);
      if (agents.length > 0) {
        console.log(`🎙️ [${slug}] AI Host enabled — ${agents.map(a => `${a.name} (${a.role})`).join(", ")}`);
        fs.mkdirSync(segmentDir, { recursive: true });

        // Pre-generate host segments for all track transitions
        const trackMeta = baseTracks.map(t => ({
          filename: t.filename,
          title: t.filename.replace(/\.[^.]+$/, "").split(" - ").slice(1).join(" - ") || t.filename.replace(/\.[^.]+$/, ""),
          artist: t.filename.replace(/\.[^.]+$/, "").split(" - ")[0] || "Unknown",
          duration: t.duration,
        }));

        const hostSegments = await pregenerateHostSegments(slug, broadcasterId, trackMeta, segmentDir);

        // Interleave host segments with tracks
        if (hostSegments.size > 0) {
          const interleaved: TrackFile[] = [];
          for (let i = 0; i < baseTracks.length; i++) {
            const segment = hostSegments.get(i);
            if (segment) {
              interleaved.push({
                path: segment.audioPath,
                filename: path.basename(segment.audioPath),
                duration: segment.duration,
              });
            }
            interleaved.push(baseTracks[i]);
          }
          finalTracks = interleaved;
          console.log(`🎙️ [${slug}] Interleaved ${hostSegments.size} host segments into ${baseTracks.length} tracks`);
        }
      }
    } catch (err) {
      console.error(`🎙️ [${slug}] AI Host generation failed, continuing without:`, err);
    }
  }

  // Start HLS pipeline with final track list (may include host segments)
  const tracks = startChannelPipelineFromTracks(config, finalTracks);
  if (tracks.length === 0) {
    console.log(`No tracks for channel ${slug} — cannot go live`);
    return false;
  }

  // Start scheduler for this channel (pass isHostSegment info)
  await startChannelScheduler(config, tracks, broadcasterId);

  // Mark as live in database
  await supabase
    .from("broadcaster_profiles")
    .update({ is_live: true })
    .eq("id", broadcasterId);

  activeChannels.set(slug, { config, broadcasterId, useAiHost: shouldUseAiHost });
  console.log(`📡 Channel ${slug} is now LIVE with ${tracks.length} items (${baseTracks.length} tracks${shouldUseAiHost ? " + host segments" : ""})`);

  // Listen for stream end to auto-loop
  const onEnded = (endedSlug: string) => {
    if (endedSlug !== slug) return;
    if (!activeChannels.has(slug)) return; // was explicitly stopped
    console.log(`🔄 [${slug}] Stream ended — auto-restarting loop...`);
    stopChannelScheduler(slug);
    // Small delay before restart to let ffmpeg fully exit
    setTimeout(async () => {
      if (!activeChannels.has(slug)) return;
      // Re-use the same tracks (including host segments if previously generated)
      const loopTracks = finalTracks.length > 0 ? finalTracks : getChannelTracks(config.musicDir);
      const newTracks = startChannelPipelineFromTracks(config, loopTracks);
      if (newTracks.length > 0) {
        await startChannelScheduler(config, newTracks, broadcasterId);
        console.log(`🔁 [${slug}] Looped — playing ${newTracks.length} items again`);
      }
    }, 2000);
  };
  streamEvents.on("ended", onEnded);

  return true;
}

export async function stopChannel(slug: string) {
  const channel = activeChannels.get(slug);
  if (!channel) return;

  // Remove from active FIRST so auto-loop handler won't restart
  activeChannels.delete(slug);

  stopChannelPipeline(slug);
  stopChannelScheduler(slug);

  // Mark as offline in database
  await supabase
    .from("broadcaster_profiles")
    .update({ is_live: false })
    .eq("id", channel.broadcasterId);

  console.log(`⏹️  Channel ${slug} is now OFFLINE`);
}

export async function restartChannel(slug: string) {
  const channel = activeChannels.get(slug);
  if (!channel) return;

  await stopChannel(slug);
  await startChannel(channel.broadcasterId, slug);
}

// ──── Queue / Cue management ────

// Per-channel cued track filename (next up)
const cuedTracks = new Map<string, string>();

export function cueTrack(slug: string, filename: string): boolean {
  const channel = activeChannels.get(slug);
  if (!channel) return false;

  // Verify the file exists
  const allTracks = getChannelTracks(channel.config.musicDir);
  const found = allTracks.find((t) => t.filename === filename);
  if (!found) return false;

  cuedTracks.set(slug, filename);
  console.log(`🎯 [${slug}] Cued next: ${filename}`);
  return true;
}

export function getCuedTrack(slug: string): string | null {
  return cuedTracks.get(slug) || null;
}

export function clearCuedTrack(slug: string) {
  cuedTracks.delete(slug);
}

export async function skipToTrack(slug: string, filename: string): Promise<boolean> {
  const channel = activeChannels.get(slug);
  if (!channel) return false;

  const { config, broadcasterId } = channel;
  const allTracks = getChannelTracks(config.musicDir);

  // Find the target track index
  const targetIdx = allTracks.findIndex((t) => t.filename === filename);
  if (targetIdx === -1) return false;

  // Reorder: target track first, then remaining tracks after it, then tracks before it
  const reordered = [
    ...allTracks.slice(targetIdx),
    ...allTracks.slice(0, targetIdx),
  ];

  console.log(`⏭️  [${slug}] Skipping to: ${filename}`);

  // Stop current pipeline + scheduler
  stopChannelPipeline(slug);
  stopChannelScheduler(slug);

  // Clear cue
  cuedTracks.delete(slug);

  // Brief delay for ffmpeg to exit
  await new Promise((r) => setTimeout(r, 500));

  // Restart with reordered tracks
  const tracks = startChannelPipelineFromTracks(config, reordered);
  if (tracks.length > 0) {
    await startChannelScheduler(config, tracks, broadcasterId);
    console.log(`▶️  [${slug}] Now playing: ${filename}`);
  }

  return tracks.length > 0;
}

export function getChannelQueue(slug: string): { tracks: { filename: string; duration: number }[]; cued: string | null } | null {
  const channel = activeChannels.get(slug);
  if (!channel) return null;

  const allTracks = getChannelTracks(channel.config.musicDir);
  return {
    tracks: allTracks.map((t) => ({ filename: t.filename, duration: t.duration })),
    cued: cuedTracks.get(slug) || null,
  };
}

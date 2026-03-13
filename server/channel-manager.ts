import fs from "fs";
import path from "path";
import { supabase } from "./supabase";
import { startChannelPipeline, stopChannelPipeline, streamEvents, type ChannelConfig } from "./stream";
import { startChannelScheduler, stopChannelScheduler } from "./scheduler";
import { syncTracksForChannel } from "./track-sync";

const BASE_MUSIC_DIR = path.join(process.cwd(), "music");
const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");

interface ActiveChannel {
  config: ChannelConfig;
  broadcasterId: string;
}

const activeChannels = new Map<string, ActiveChannel>();

export function getActiveChannels() {
  return activeChannels;
}

export async function startChannel(broadcasterId: string, slug: string): Promise<boolean> {
  if (activeChannels.has(slug)) {
    console.log(`Channel ${slug} already active`);
    return true;
  }

  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(musicDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });

  // Sync tracks from Supabase Storage to local music dir
  await syncTracksForChannel(broadcasterId, slug, musicDir);

  const config: ChannelConfig = { slug, musicDir, outputDir };

  // Start HLS pipeline
  const tracks = startChannelPipeline(config);
  if (tracks.length === 0) {
    console.log(`No tracks for channel ${slug} — cannot go live`);
    return false;
  }

  // Start scheduler for this channel
  await startChannelScheduler(config, tracks, broadcasterId);

  // Mark as live in database
  await supabase
    .from("broadcaster_profiles")
    .update({ is_live: true })
    .eq("id", broadcasterId);

  activeChannels.set(slug, { config, broadcasterId });
  console.log(`📡 Channel ${slug} is now LIVE with ${tracks.length} tracks`);

  // Listen for stream end to auto-loop
  const onEnded = (endedSlug: string) => {
    if (endedSlug !== slug) return;
    if (!activeChannels.has(slug)) return; // was explicitly stopped
    console.log(`🔄 [${slug}] Stream ended — auto-restarting loop...`);
    stopChannelScheduler(slug);
    // Small delay before restart to let ffmpeg fully exit
    setTimeout(async () => {
      if (!activeChannels.has(slug)) return;
      const newTracks = startChannelPipeline(config);
      if (newTracks.length > 0) {
        await startChannelScheduler(config, newTracks, broadcasterId);
        console.log(`🔁 [${slug}] Looped — playing ${newTracks.length} tracks again`);
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

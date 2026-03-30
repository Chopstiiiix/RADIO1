/**
 * Caster backend server — runs on port 5000
 *
 * Next.js rewrites proxy these paths from the public port:
 *   /stream/:slug/*    → HLS segments
 *   /metadata/*         → SSE + REST metadata
 *   /api/channels/*     → Channel management REST API
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { startChannelPipeline, startChannelPipelineFromTracks, stopChannelPipeline, getChannelTracks, streamEvents, type TrackFile } from "./stream";
import { supabase } from "./supabase";
import { syncTracksForChannel } from "./track-sync";
import type { Response } from "express";

// Suppress auto-loop when pipeline is deliberately restarted (e.g., add-tracks)
const suppressAutoLoop = new Set<string>();

const PORT = 5000;
const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");
const BASE_MUSIC_DIR = path.join(process.cwd(), "music");

// ── Channel Manager ──

interface ChannelState {
  broadcasterId: string;
  tracks: TrackFile[];
  currentIndex: number;
  cuedTrack: string | null;
}

const activeChannels = new Map<string, ChannelState>();

async function startChannel(broadcasterId: string, slug: string, trackIds?: string[], useAiHost?: boolean): Promise<boolean> {
  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(musicDir, { recursive: true });

  // Sync tracks from Supabase Storage to local disk before starting
  await syncTracksForChannel(broadcasterId, slug, musicDir, trackIds);

  let tracks: TrackFile[];
  const allTracks = getChannelTracks(musicDir);
  if (allTracks.length === 0) return false;

  // Use all synced tracks (they're already filtered by trackIds in syncTracksForChannel)
  tracks = startChannelPipelineFromTracks({ slug, musicDir, outputDir }, allTracks);

  if (tracks.length === 0) return false;

  activeChannels.set(slug, { broadcasterId, tracks, currentIndex: 0, cuedTrack: null });

  await supabase.from("broadcaster_profiles").update({ is_live: true }).eq("channel_slug", slug);

  updateNowPlaying(slug, {
    track: { title: tracks[0].filename.replace(/\.[^.]+$/, ""), artist: "Caster" },
    upcoming: tracks.slice(1, 4).map(t => ({ title: t.filename.replace(/\.[^.]+$/, ""), artist: "Caster" })),
    duration: tracks[0].duration,
    trackStartOffset: 0,
    ended: false,
  });

  startTrackTimer(slug);
  return true;
}

async function stopChannel(slug: string) {
  stopChannelPipeline(slug);
  activeChannels.delete(slug);
  await supabase.from("broadcaster_profiles").update({ is_live: false }).eq("channel_slug", slug);
  updateNowPlaying(slug, { track: null, upcoming: [], ended: true });
}

function startTrackTimer(slug: string) {
  const ch = activeChannels.get(slug);
  if (!ch) return;

  const track = ch.tracks[ch.currentIndex];
  if (!track) return;

  setTimeout(() => {
    const current = activeChannels.get(slug);
    if (!current) return;

    if (current.cuedTrack) {
      const cuedIndex = current.tracks.findIndex(t => t.filename === current.cuedTrack);
      if (cuedIndex !== -1) {
        current.currentIndex = cuedIndex;
        current.cuedTrack = null;
      } else {
        current.currentIndex++;
      }
    } else {
      current.currentIndex++;
    }

    if (current.currentIndex >= current.tracks.length) {
      current.currentIndex = 0;
    }

    const next = current.tracks[current.currentIndex];
    const upcoming = [];
    for (let i = 1; i <= 3; i++) {
      const idx = (current.currentIndex + i) % current.tracks.length;
      upcoming.push({ title: current.tracks[idx].filename.replace(/\.[^.]+$/, ""), artist: "Caster" });
    }

    let cumulativeOffset = 0;
    for (let i = 0; i < current.currentIndex; i++) {
      cumulativeOffset += current.tracks[i].duration;
    }

    updateNowPlaying(slug, {
      track: { title: next.filename.replace(/\.[^.]+$/, ""), artist: "Caster" },
      upcoming,
      duration: next.duration,
      trackStartOffset: cumulativeOffset,
      ended: false,
    });

    startTrackTimer(slug);
  }, track.duration * 1000);
}

async function skipToTrack(slug: string, filename: string): Promise<boolean> {
  const ch = activeChannels.get(slug);
  if (!ch) return false;
  const idx = ch.tracks.findIndex(t => t.filename === filename);
  if (idx === -1) return false;
  ch.currentIndex = idx;
  const track = ch.tracks[idx];

  let cumulativeOffset = 0;
  for (let i = 0; i < idx; i++) cumulativeOffset += ch.tracks[i].duration;

  const upcoming = [];
  for (let i = 1; i <= 3; i++) {
    const ui = (idx + i) % ch.tracks.length;
    upcoming.push({ title: ch.tracks[ui].filename.replace(/\.[^.]+$/, ""), artist: "Caster" });
  }

  updateNowPlaying(slug, {
    track: { title: track.filename.replace(/\.[^.]+$/, ""), artist: "Caster" },
    upcoming,
    duration: track.duration,
    trackStartOffset: cumulativeOffset,
    ended: false,
  });
  return true;
}

function cueTrack(slug: string, filename: string): boolean {
  const ch = activeChannels.get(slug);
  if (!ch) return false;
  if (!ch.tracks.find(t => t.filename === filename)) return false;
  ch.cuedTrack = filename;
  return true;
}

function getChannelQueue(slug: string) {
  const ch = activeChannels.get(slug);
  if (!ch) return null;
  return {
    current: ch.tracks[ch.currentIndex]?.filename,
    cued: ch.cuedTrack,
    queue: ch.tracks.map(t => t.filename),
    currentIndex: ch.currentIndex,
  };
}

// ── Metadata SSE ──

interface NowPlayingState {
  track: { title: string; artist: string; album?: string } | null;
  upcoming: { title: string; artist: string }[];
  duration: number;
  startedAt: number;
  trackStartOffset: number;
  ended: boolean;
  type?: "track" | "host_segment" | "advert";
}

const channelStates = new Map<string, NowPlayingState>();
const channelClients = new Map<string, Set<Response>>();

function getDefaultState(): NowPlayingState {
  return { track: null, upcoming: [], duration: 0, startedAt: 0, trackStartOffset: 0, ended: false };
}

function updateNowPlaying(slug: string, state: Partial<NowPlayingState>) {
  const current = channelStates.get(slug) || getDefaultState();
  if (state.track) state.startedAt = Date.now();
  const updated = { ...current, ...state };
  channelStates.set(slug, updated);
  broadcastToChannel(slug);
}

function broadcastToChannel(slug: string) {
  const state = channelStates.get(slug);
  if (!state) return;
  const clients = channelClients.get(slug);
  if (!clients) return;
  const data = `data: ${JSON.stringify(state)}\n\n`;
  for (const client of clients) client.write(data);
}

// Heartbeat
setInterval(() => {
  for (const clients of channelClients.values()) {
    for (const client of clients) client.write(": heartbeat\n\n");
  }
}, 15000);

// ── Auto-loop handler ──
streamEvents.on("ended", async (slug: string) => {
  // Skip auto-loop if pipeline was deliberately restarted (e.g., add-tracks)
  if (suppressAutoLoop.has(slug)) {
    suppressAutoLoop.delete(slug);
    return;
  }
  const ch = activeChannels.get(slug);
  if (!ch) return;
  console.log(`🔁 [${slug}] Playlist ended, auto-looping...`);
  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  const tracks = startChannelPipeline({ slug, musicDir, outputDir });
  if (tracks.length > 0) {
    ch.currentIndex = 0;
    ch.tracks = tracks;
    startTrackTimer(slug);
  }
});

// ── Express App ──
async function main() {
  console.log("🎙️  Caster Backend Server Starting...\n");

  const app = express();
  app.use(cors());

  // ── Stream routes: /stream/:slug/* ──
  app.use("/stream/:slug", (req, res, next) => {
    const { slug } = req.params;
    const channelOutputDir = path.join(BASE_OUTPUT_DIR, slug);
    if (!fs.existsSync(channelOutputDir)) {
      return res.status(404).json({ error: "Channel not found" });
    }
    express.static(channelOutputDir, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith(".m3u8")) {
          res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
          res.setHeader("Cache-Control", "no-cache");
        } else if (filePath.endsWith(".m4s")) {
          res.setHeader("Content-Type", "video/iso.segment");
        } else if (filePath.endsWith(".mp4")) {
          res.setHeader("Content-Type", "video/mp4");
        }
      },
    })(req, res, next);
  });

  // ── Metadata SSE routes: /metadata/* ──
  app.get("/metadata/channels/:slug/now-playing", (req, res) => {
    const { slug } = req.params;
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    const state = channelStates.get(slug) || getDefaultState();
    res.write(`data: ${JSON.stringify(state)}\n\n`);
    if (!channelClients.has(slug)) channelClients.set(slug, new Set());
    channelClients.get(slug)!.add(res);
    req.on("close", () => channelClients.get(slug)?.delete(res));
  });

  app.get("/metadata/api/channels/:slug/now-playing", (req, res) => {
    const state = channelStates.get(req.params.slug) || getDefaultState();
    res.json(state);
  });

  app.get("/metadata/api/channels", (_req, res) => {
    const channels: Record<string, NowPlayingState> = {};
    for (const [slug, state] of channelStates) channels[slug] = state;
    res.json(channels);
  });

  // ── Channel management API: /api/channels/* ──
  app.use("/api/channels", express.json());

  app.post("/api/channels/:slug/start", async (req, res) => {
    const { slug } = req.params;
    const { broadcaster_id, track_ids, use_ai_host } = req.body;
    if (!broadcaster_id) return res.status(400).json({ error: "broadcaster_id required" });

    const { data: channel } = await supabase
      .from("broadcaster_profiles")
      .select("id, channel_slug")
      .eq("id", broadcaster_id)
      .eq("channel_slug", slug)
      .single();

    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const success = await startChannel(broadcaster_id, slug, track_ids, use_ai_host);
    if (success) res.json({ ok: true, message: `Channel ${slug} is now live` });
    else res.status(400).json({ error: "No tracks available — select tracks to broadcast" });
  });

  app.post("/api/channels/:slug/stop", async (req, res) => {
    await stopChannel(req.params.slug);
    res.json({ ok: true, message: `Channel ${req.params.slug} is now offline` });
  });

  app.post("/api/channels/:slug/skip", async (req, res) => {
    const { slug } = req.params;
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const success = await skipToTrack(slug, filename);
    if (success) res.json({ ok: true, message: `Now playing: ${filename}` });
    else res.status(400).json({ error: "Track not found or channel not active" });
  });

  app.post("/api/channels/:slug/cue", (req, res) => {
    const { slug } = req.params;
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: "filename required" });
    const success = cueTrack(slug, filename);
    if (success) res.json({ ok: true, message: `Cued: ${filename}` });
    else res.status(400).json({ error: "Track not found or channel not active" });
  });

  app.post("/api/channels/:slug/add-tracks", async (req, res) => {
    const { slug } = req.params;
    const { broadcaster_id, track_ids } = req.body;
    if (!broadcaster_id || !track_ids?.length) {
      return res.status(400).json({ error: "broadcaster_id and track_ids required" });
    }

    const ch = activeChannels.get(slug);
    if (!ch) {
      return res.status(400).json({ error: "Channel not active" });
    }

    try {
      const musicDir = path.join(BASE_MUSIC_DIR, slug);
      const outputDir = path.join(BASE_OUTPUT_DIR, slug);

      // Sync new tracks additively (don't delete existing files)
      await syncTracksForChannel(broadcaster_id, slug, musicDir, track_ids, true);

      // Get full set of tracks now on disk (old + new)
      const allTracks = getChannelTracks(musicDir);
      if (allTracks.length === 0) {
        return res.status(400).json({ error: "No tracks available" });
      }

      console.log(`➕ [${slug}] Adding ${track_ids.length} tracks — restarting pipeline with ${allTracks.length} total`);

      // Suppress auto-loop before stopping — we're restarting deliberately
      suppressAutoLoop.add(slug);
      stopChannelPipeline(slug);

      // Brief delay for ffmpeg to exit
      await new Promise((r) => setTimeout(r, 500));

      // Restart with combined tracks
      const tracks = startChannelPipelineFromTracks({ slug, musicDir, outputDir }, allTracks);
      if (tracks.length === 0) {
        return res.status(400).json({ error: "Failed to restart pipeline" });
      }

      // Update channel state
      ch.tracks = tracks;
      ch.currentIndex = 0;
      ch.cuedTrack = null;

      // Update now-playing
      updateNowPlaying(slug, {
        track: { title: tracks[0].filename.replace(/\.[^.]+$/, ""), artist: "Caster" },
        upcoming: tracks.slice(1, 4).map(t => ({ title: t.filename.replace(/\.[^.]+$/, ""), artist: "Caster" })),
        duration: tracks[0].duration,
        trackStartOffset: 0,
        ended: false,
      });

      startTrackTimer(slug);

      res.json({ ok: true, message: `Added ${track_ids.length} track(s) — now playing ${tracks.length} total` });
    } catch (err) {
      console.error(`[${slug}] add-tracks error:`, err);
      res.status(500).json({ error: "Failed to add tracks" });
    }
  });

  app.get("/api/channels/:slug/queue", (req, res) => {
    const queue = getChannelQueue(req.params.slug);
    if (queue) res.json(queue);
    else res.status(404).json({ error: "Channel not active" });
  });

  app.get("/api/channels/active", (_req, res) => {
    const channels = Array.from(activeChannels.entries()).map(([slug, ch]) => ({
      slug,
      broadcasterId: ch.broadcasterId,
    }));
    res.json(channels);
  });

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🔥 Caster backend live on port ${PORT}`);
    console.log(`   📡 Stream:   /stream/{slug}/stream.m3u8`);
    console.log(`   📊 Metadata: /metadata/channels/{slug}/now-playing`);
    console.log(`   🔧 API:      /api/channels/*\n`);
  });
}

main().catch(console.error);

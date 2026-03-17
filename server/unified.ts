/**
 * Unified Radio1 server for single-port deployment (Railway, Render, etc.)
 *
 * Consolidates all services behind one PORT:
 *   /stream/:slug/*   → HLS segments
 *   /metadata/*        → SSE + REST metadata
 *   /api/channels/*    → Channel management REST API
 *   Everything else    → Next.js standalone (proxied)
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createProxyMiddleware } from "http-proxy-middleware";
import { startChannelPipeline, startChannelPipelineFromTracks, stopChannelPipeline, getChannelTracks, streamEvents, type TrackFile } from "./stream";
import { supabase } from "./supabase";
import type { Response } from "express";

const PORT = parseInt(process.env.PORT || "3000");
const NEXTJS_INTERNAL_PORT = 3001;
const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");
const BASE_MUSIC_DIR = path.join(process.cwd(), "music");

// ── Channel Manager (inlined from channel-manager.ts to avoid circular deps) ──

interface ChannelState {
  broadcasterId: string;
  tracks: TrackFile[];
  currentIndex: number;
  cuedTrack: string | null;
}

const activeChannels = new Map<string, ChannelState>();

function getActiveChannels() { return activeChannels; }

async function startChannel(broadcasterId: string, slug: string, trackIds?: string[]): Promise<boolean> {
  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(musicDir, { recursive: true });

  let tracks: TrackFile[];
  if (trackIds && trackIds.length > 0) {
    const allTracks = getChannelTracks(musicDir);
    tracks = trackIds
      .map(id => allTracks.find(t => t.filename === id))
      .filter((t): t is TrackFile => !!t);

    if (tracks.length === 0) return false;
    tracks = startChannelPipelineFromTracks({ slug, musicDir, outputDir }, tracks);
  } else {
    tracks = startChannelPipeline({ slug, musicDir, outputDir });
  }

  if (tracks.length === 0) return false;

  activeChannels.set(slug, { broadcasterId, tracks, currentIndex: 0, cuedTrack: null });

  await supabase.from("broadcaster_profiles").update({ is_live: true }).eq("channel_slug", slug);

  updateNowPlaying(slug, {
    track: { title: tracks[0].filename.replace(/\.[^.]+$/, ""), artist: "Radio1" },
    upcoming: tracks.slice(1, 4).map(t => ({ title: t.filename.replace(/\.[^.]+$/, ""), artist: "Radio1" })),
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
      upcoming.push({ title: current.tracks[idx].filename.replace(/\.[^.]+$/, ""), artist: "Radio1" });
    }

    let cumulativeOffset = 0;
    for (let i = 0; i < current.currentIndex; i++) {
      cumulativeOffset += current.tracks[i].duration;
    }

    updateNowPlaying(slug, {
      track: { title: next.filename.replace(/\.[^.]+$/, ""), artist: "Radio1" },
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
    upcoming.push({ title: ch.tracks[ui].filename.replace(/\.[^.]+$/, ""), artist: "Radio1" });
  }

  updateNowPlaying(slug, {
    track: { title: track.filename.replace(/\.[^.]+$/, ""), artist: "Radio1" },
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

// ── Metadata SSE (inlined) ──

interface NowPlayingState {
  track: { title: string; artist: string; album?: string } | null;
  upcoming: { title: string; artist: string }[];
  duration: number;
  startedAt: number;
  trackStartOffset: number;
  ended: boolean;
}

const channelStates = new Map<string, NowPlayingState>();
const channelClients = new Map<string, Set<Response>>();

function getDefaultState(): NowPlayingState {
  return { track: null, upcoming: [], duration: 0, startedAt: 0, trackStartOffset: 0, ended: false };
}

// Re-export for use by channel manager above
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
  console.log("🎙️  Radio1 Unified Server Starting...\n");

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
    const { broadcaster_id, track_ids } = req.body;
    if (!broadcaster_id) return res.status(400).json({ error: "broadcaster_id required" });

    const { data: channel } = await supabase
      .from("broadcaster_profiles")
      .select("id, channel_slug")
      .eq("id", broadcaster_id)
      .eq("channel_slug", slug)
      .single();

    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const success = await startChannel(broadcaster_id, slug, track_ids);
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

  // ── Proxy everything else to Next.js ──
  app.use(
    createProxyMiddleware({
      target: `http://127.0.0.1:${NEXTJS_INTERNAL_PORT}`,
      changeOrigin: true,
      ws: true,
    })
  );

  // Start Next.js standalone
  const nextJs = spawn("node", ["server.js"], {
    env: {
      ...process.env,
      PORT: String(NEXTJS_INTERNAL_PORT),
      HOSTNAME: "127.0.0.1",
    },
    stdio: "inherit",
  });

  nextJs.on("error", (err) => console.error("Next.js error:", err));
  nextJs.on("exit", (code) => {
    console.error(`Next.js exited with code ${code}`);
    process.exit(1);
  });

  // Give Next.js a moment to boot
  await new Promise((resolve) => setTimeout(resolve, 2000));

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🔥 Radio1 unified server live on port ${PORT}`);
    console.log(`   📡 Stream:   /stream/{slug}/stream.m3u8`);
    console.log(`   📊 Metadata: /metadata/channels/{slug}/now-playing`);
    console.log(`   🔧 API:      /api/channels/*`);
    console.log(`   🌐 Next.js:  proxied from :${NEXTJS_INTERNAL_PORT}\n`);
  });
}

main().catch(console.error);

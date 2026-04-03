/**
 * Caster backend server — runs on port 5000
 *
 * Next.js rewrites proxy these paths from the public port:
 *   /stream/:slug/*    → HLS segments (single mixed stream)
 *   /metadata/*         → SSE + REST metadata
 *   /api/channels/*     → Channel management REST API
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import http from "http";
import { WebSocketServer } from "ws";
import { startChannelPipeline, startChannelPipelineFromTracks, stopChannelPipeline, getChannelTracks, streamEvents, type TrackFile } from "./stream";
import { supabase } from "./supabase";
import { syncTracksForChannel } from "./track-sync";
import { isAiHostEnabled, getBroadcasterAgents, pregenerateHostSegments } from "./react-agent";
import { startMixer, connectMusicSource, writeMicAudio, stopMicInput, stopMixer, setMixerVolumes, hasMixer } from "./mic-mixer";
import { AccessToken } from "livekit-server-sdk";
import type { Response } from "express";

// Suppress auto-loop when pipeline is deliberately restarted (e.g., add-tracks)
const suppressAutoLoop = new Set<string>();

const PORT = parseInt(process.env.BACKEND_PORT || "5001");
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

/** Parse "Artist - Title.ext" filename into metadata. */
function parseTrackMeta(filename: string): { title: string; artist: string } {
  // Host segment tagged filenames: HOST__Adam__Eve__1234_track_intro.mp3
  if (filename.startsWith("HOST__")) {
    const parts = filename.replace(/^HOST__/, "").split("__");
    const speakers = parts.slice(0, -1); // last part is original filename
    if (speakers.length > 0) {
      const hostNames = speakers.length === 1
        ? speakers[0]
        : speakers.slice(0, -1).join(", ") + " & " + speakers[speakers.length - 1];
      return { artist: hostNames, title: hostNames };
    }
    return { artist: "AI Host", title: "AI Host" };
  }

  const name = filename.replace(/\.[^.]+$/, ""); // strip extension
  const sep = name.indexOf(" - ");
  if (sep !== -1) {
    return { artist: name.slice(0, sep).trim(), title: name.slice(sep + 3).trim() };
  }
  return { artist: "Unknown", title: name.trim() };
}

/** Build upcoming list from tracks array starting at index (skip host segments). */
function buildUpcoming(tracks: TrackFile[], fromIndex: number, count = 3) {
  const upcoming = [];
  for (let i = 1; upcoming.length < count && i < tracks.length; i++) {
    const idx = (fromIndex + i) % tracks.length;
    const fn = tracks[idx].filename;
    if (fn.includes("_host_segments") || fn.startsWith("HOST__")) continue;
    upcoming.push(parseTrackMeta(fn));
  }
  return upcoming;
}

async function startChannel(broadcasterId: string, slug: string, trackIds?: string[], mode: "tracks" | "live_mic" = "tracks"): Promise<boolean> {
  // Clean up any stale state from a previous session
  stopChannelPipeline(slug);
  stopMixer(slug);
  activeChannels.delete(slug);

  const musicDir = path.join(BASE_MUSIC_DIR, slug);
  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.mkdirSync(musicDir, { recursive: true });

  // Sync tracks from Supabase Storage to local disk before starting
  await syncTracksForChannel(broadcasterId, slug, musicDir, trackIds);

  const baseTracks = getChannelTracks(musicDir);
  if (baseTracks.length === 0) return false;

  // Check if broadcaster has AI host enabled (reads from DB — no frontend flag needed)
  let finalTracks = baseTracks;
  const shouldUseAiHost = await isAiHostEnabled(broadcasterId);
  if (shouldUseAiHost) {
    try {
      const agents = await getBroadcasterAgents(broadcasterId);
      if (agents.length > 0) {
        console.log(`🎙️ [${slug}] AI Host enabled — ${agents.map(a => `${a.name} (${a.role})`).join(", ")}`);

        const segmentDir = path.join(musicDir, "_host_segments");
        fs.mkdirSync(segmentDir, { recursive: true });

        // Clean old host segments
        if (fs.existsSync(segmentDir)) {
          for (const f of fs.readdirSync(segmentDir)) {
            fs.unlinkSync(path.join(segmentDir, f));
          }
        }

        const trackMeta = baseTracks.map(t => ({
          filename: t.filename,
          title: t.filename.replace(/\.[^.]+$/, "").split(" - ").slice(1).join(" - ") || t.filename.replace(/\.[^.]+$/, ""),
          artist: t.filename.replace(/\.[^.]+$/, "").split(" - ")[0] || "Unknown",
          duration: t.duration,
        }));

        const hostSegments = await pregenerateHostSegments(slug, broadcasterId, trackMeta, segmentDir);

        if (hostSegments.size > 0) {
          const interleaved: TrackFile[] = [];
          for (let i = 0; i < baseTracks.length; i++) {
            const segment = hostSegments.get(i);
            if (segment) {
              // Encode speaker names into filename so scheduler can display them
              // Format: HOST__Adam__Eve__1234_track_intro.mp3
              const speakerTag = segment.speakers.join("__");
              const originalName = path.basename(segment.audioPath);
              const taggedFilename = `HOST__${speakerTag}__${originalName}`;
              interleaved.push({
                path: segment.audioPath,
                filename: taggedFilename,
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

  // Start the unified mixer (creates output HLS FFmpeg)
  startMixer(slug);

  // Start the music decoder (raw PCM output)
  const result = startChannelPipelineFromTracks({ slug, musicDir, outputDir }, finalTracks);
  if (!result) {
    stopMixer(slug);
    return false;
  }

  // Pipe music PCM into the mixer
  connectMusicSource(slug, result.process);

  const tracks = result.tracks;
  activeChannels.set(slug, { broadcasterId, tracks, currentIndex: 0, cuedTrack: null });

  await supabase.from("broadcaster_profiles").update({ is_live: true }).eq("channel_slug", slug);

  const firstIsHost = tracks[0].filename.includes("_host_segments") || tracks[0].filename.startsWith("HOST__");
  updateNowPlaying(slug, {
    track: parseTrackMeta(tracks[0].filename),
    upcoming: buildUpcoming(tracks, 0),
    duration: tracks[0].duration,
    trackStartOffset: 0,
    ended: false,
    type: firstIsHost ? "host_segment" : "track",
    mode,
  });

  startTrackTimer(slug);
  return true;
}

async function stopChannel(slug: string) {
  stopChannelPipeline(slug);
  stopMicInput(slug);
  stopMixer(slug);
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

    let cumulativeOffset = 0;
    for (let i = 0; i < current.currentIndex; i++) {
      cumulativeOffset += current.tracks[i].duration;
    }

    const isHostSeg = next.filename.includes("_host_segments") || next.filename.startsWith("HOST__");
    updateNowPlaying(slug, {
      track: parseTrackMeta(next.filename),
      upcoming: buildUpcoming(current.tracks, current.currentIndex),
      duration: next.duration,
      trackStartOffset: cumulativeOffset,
      ended: false,
      type: isHostSeg ? "host_segment" : "track",
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

  updateNowPlaying(slug, {
    track: parseTrackMeta(track.filename),
    upcoming: buildUpcoming(ch.tracks, idx),
    duration: track.duration,
    trackStartOffset: cumulativeOffset,
    ended: false,
    type: "track",
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
  mode?: "tracks" | "live_mic";
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

// ── Scheduled broadcast checker (every 30 seconds) ──
setInterval(async () => {
  try {
    const { data: due } = await supabase
      .from("scheduled_broadcasts")
      .select("id, broadcaster_id, track_ids")
      .eq("status", "pending")
      .lte("scheduled_at", new Date().toISOString())
      .limit(5);

    if (!due || due.length === 0) return;

    for (const schedule of due) {
      // Get broadcaster's channel slug
      const { data: bp } = await supabase
        .from("broadcaster_profiles")
        .select("channel_slug, is_live")
        .eq("id", schedule.broadcaster_id)
        .single();

      if (!bp || bp.is_live) {
        // Already live or no profile — mark as started to skip
        await supabase.from("scheduled_broadcasts").update({ status: "started" }).eq("id", schedule.id);
        continue;
      }

      console.log(`⏰ [${bp.channel_slug}] Starting scheduled broadcast with ${schedule.track_ids.length} tracks`);

      const success = await startChannel(schedule.broadcaster_id, bp.channel_slug, schedule.track_ids);

      await supabase
        .from("scheduled_broadcasts")
        .update({ status: success ? "started" : "cancelled" })
        .eq("id", schedule.id);

      if (success) {
        console.log(`✅ [${bp.channel_slug}] Scheduled broadcast started`);
      } else {
        console.log(`❌ [${bp.channel_slug}] Scheduled broadcast failed to start`);
      }
    }
  } catch (err) {
    console.error("Scheduled broadcast check error:", err);
  }
}, 30000);

// ── Auto-end handler (broadcast ends when all tracks finish) ──
streamEvents.on("ended", async (slug: string) => {
  // Skip if pipeline was deliberately restarted (e.g., add-tracks)
  if (suppressAutoLoop.has(slug)) {
    suppressAutoLoop.delete(slug);
    return;
  }
  const ch = activeChannels.get(slug);
  if (!ch) return;
  console.log(`⏹️  [${slug}] Playlist finished — ending broadcast.`);
});

// ── Express App ──
async function main() {
  console.log("🎙️  Caster Backend Server Starting...\n");

  const app = express();
  app.use(cors());

  // ── Health check (Railway uses this) ──
  app.get("/", (_req, res) => res.json({ status: "ok", service: "caster-backend" }));

  // ── Stream routes: /stream/:slug/* (single mixed HLS output) ──
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
    const { broadcaster_id, track_ids, mode } = req.body;
    if (!broadcaster_id) return res.status(400).json({ error: "broadcaster_id required" });

    // If channel is already live in tracks mode with an active mixer, don't restart
    const existingState = channelStates.get(slug);
    if (activeChannels.has(slug) && hasMixer(slug) && existingState?.mode === "tracks") {
      console.log(`⚡ [${slug}] Already live in tracks mode — ignoring duplicate start`);
      return res.json({ ok: true, message: `Channel ${slug} is already live` });
    }

    const { data: channel } = await supabase
      .from("broadcaster_profiles")
      .select("id, channel_slug")
      .eq("id", broadcaster_id)
      .eq("channel_slug", slug)
      .single();

    if (!channel) return res.status(404).json({ error: "Channel not found" });
    const success = await startChannel(broadcaster_id, slug, track_ids, mode || "tracks");
    if (success) res.json({ ok: true, message: `Channel ${slug} is now live` });
    else res.status(400).json({ error: "No tracks available — select tracks to broadcast" });
  });

  app.post("/api/channels/:slug/voice-only", async (req, res) => {
    const { slug } = req.params;
    const { broadcaster_id } = req.body;
    if (!broadcaster_id) return res.status(400).json({ error: "broadcaster_id required" });

    // If already live in mic mode, don't restart
    const existingState = channelStates.get(slug);
    if (activeChannels.has(slug) && hasMixer(slug) && existingState?.mode === "live_mic") {
      console.log(`⚡ [${slug}] Already live in mic mode — ignoring duplicate`);
      return res.json({ ok: true, message: `Channel ${slug} is already live` });
    }

    // Stop any existing broadcast (e.g., tracks mode) before starting mic-live
    if (activeChannels.has(slug)) {
      console.log(`🔄 [${slug}] Stopping tracks broadcast to start mic-live`);
      await stopChannel(slug);
    }

    // Clean up any remaining stale state
    stopChannelPipeline(slug);
    stopMixer(slug);

    // Start mixer for voice-only — mic PCM will flow directly to HLS output
    startMixer(slug);

    // Get broadcaster display name for metadata
    const { data: bp } = await supabase
      .from("broadcaster_profiles")
      .select("channel_name")
      .eq("id", broadcaster_id)
      .single();

    await supabase.from("broadcaster_profiles").update({ is_live: true }).eq("channel_slug", slug);

    activeChannels.set(slug, { broadcasterId: broadcaster_id, tracks: [], currentIndex: 0, cuedTrack: null });

    updateNowPlaying(slug, {
      track: { title: "Live Broadcast", artist: bp?.channel_name || slug },
      upcoming: [],
      duration: 0,
      trackStartOffset: 0,
      ended: false,
      type: "track",
      mode: "live_mic",
    });

    console.log(`🎤 Channel ${slug} is now LIVE (voice only, mode: live_mic)`);
    res.json({ ok: true, message: `Channel ${slug} is live — voice only` });
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

      // Restart music decoder with combined tracks (mixer stays running)
      const result = startChannelPipelineFromTracks({ slug, musicDir, outputDir }, allTracks);
      if (!result) {
        return res.status(400).json({ error: "Failed to restart pipeline" });
      }

      // Reconnect new music decoder to existing mixer
      connectMusicSource(slug, result.process);

      const tracks = result.tracks;

      // Update channel state
      ch.tracks = tracks;
      ch.currentIndex = 0;
      ch.cuedTrack = null;

      // Update now-playing
      updateNowPlaying(slug, {
        track: parseTrackMeta(tracks[0].filename),
        upcoming: buildUpcoming(tracks, 0),
        duration: tracks[0].duration,
        trackStartOffset: 0,
        ended: false,
        type: "track",
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

  // ── Mic audio endpoint (writes into the unified mixer) ──
  const micChunkCount = new Map<string, number>();
  app.post("/api/mic/:slug", (req, res) => {
    const { slug } = req.params;
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const data = Buffer.concat(chunks);
      const count = (micChunkCount.get(slug) || 0) + 1;
      micChunkCount.set(slug, count);
      if (count % 50 === 1) console.log(`🎤 [${slug}] Mic chunk #${count} — ${data.length} bytes`);
      if (writeMicAudio(slug, data)) {
        res.json({ ok: true });
      } else {
        res.status(500).json({ error: "Failed to write mic audio — is the channel live?" });
      }
    });
  });

  app.post("/api/mic/:slug/stop", (req, res) => {
    stopMicInput(req.params.slug);
    res.json({ ok: true });
  });

  // ── Broadcast volume control ──
  app.use("/api/channels/:slug/volume", express.json());
  app.post("/api/channels/:slug/volume", (req, res) => {
    const { slug } = req.params;
    const { music_volume, mic_volume } = req.body;
    const ok = setMixerVolumes(slug, music_volume, mic_volume);
    if (ok) res.json({ ok: true });
    else res.status(404).json({ error: "Channel not active" });
  });

  // ── LiveKit token endpoint ──
  app.use("/api/livekit/token", express.json());
  app.post("/api/livekit/token", async (req, res) => {
    const { identity, slug, role } = req.body;
    if (!identity || !slug) return res.status(400).json({ error: "identity and slug required" });

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_WS_URL || "ws://localhost:7880";

    if (!apiKey || !apiSecret) {
      return res.status(500).json({ error: "LiveKit not configured" });
    }

    const isHost = role === "host";
    const roomName = `caster-${slug}`;

    const token = new AccessToken(apiKey, apiSecret, {
      identity,
      ttl: "4h",
      metadata: JSON.stringify({ role: isHost ? "host" : "listener", slug }),
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: isHost,
      canPublishData: isHost,
      canSubscribe: true,
    });

    return res.json({
      token: await token.toJwt(),
      livekitUrl,
      room: roomName,
    });
  });

  // ── HTTP + WebSocket server ──
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: "/ws/mic" });

  wss.on("connection", (ws, req) => {
    // Extract slug from query: /ws/mic?slug=broadcaster
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      ws.close(1008, "slug required");
      return;
    }

    console.log(`🎤 [${slug}] WebSocket mic connected`);
    let chunks = 0;

    ws.on("message", (data: Buffer) => {
      // Binary PCM frames from browser
      if (Buffer.isBuffer(data)) {
        writeMicAudio(slug, data);
        chunks++;
        if (chunks % 100 === 1) {
          console.log(`🎤 [${slug}] WS mic chunk #${chunks} — ${data.length} bytes`);
        }
      }
    });

    ws.on("close", () => {
      console.log(`🎤 [${slug}] WebSocket mic disconnected (${chunks} chunks sent)`);
      stopMicInput(slug);
    });

    ws.on("error", (err) => {
      console.error(`🎤 [${slug}] WebSocket mic error:`, err.message);
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`\n🔥 Caster backend live on port ${PORT}`);
    console.log(`   📡 Stream:   /stream/{slug}/stream.m3u8`);
    console.log(`   🎤 Mic:      ws://host:${PORT}/ws/mic?slug={slug}`);
    console.log(`   📊 Metadata: /metadata/channels/{slug}/now-playing`);
    console.log(`   🔧 API:      /api/channels/*\n`);
  });
}

main().catch(console.error);

import "dotenv/config";
import express from "express";
import cors from "cors";
import { startStreamServer } from "./stream";
import { startMetadataServer } from "./metadata-server";
import { startChannel, stopChannel, getActiveChannels, skipToTrack, cueTrack, getCuedTrack, getChannelQueue } from "./channel-manager";
import { supabase } from "./supabase";

const STREAM_PORT = parseInt(process.env.STREAM_PORT || "8000");
const METADATA_PORT = parseInt(process.env.METADATA_PORT || "8001");
const API_PORT = 8002;

async function main() {
  console.log("🎙️  Caster Server Starting...\n");

  // Start the HTTP servers
  startStreamServer(STREAM_PORT);
  startMetadataServer(METADATA_PORT);

  // REST API for channel management
  const api = express();
  api.use(cors());
  api.use(express.json());

  // Go live — start a channel
  api.post("/api/channels/:slug/start", async (req, res) => {
    const { slug } = req.params;
    const { broadcaster_id, track_ids } = req.body;

    if (!broadcaster_id) {
      return res.status(400).json({ error: "broadcaster_id required" });
    }

    // Verify slug matches broadcaster
    const { data: channel } = await supabase
      .from("broadcaster_profiles")
      .select("id, channel_slug")
      .eq("id", broadcaster_id)
      .eq("channel_slug", slug)
      .single();

    if (!channel) {
      return res.status(404).json({ error: "Channel not found" });
    }

    const success = await startChannel(broadcaster_id, slug, track_ids);
    if (success) {
      res.json({ ok: true, message: `Channel ${slug} is now live` });
    } else {
      res.status(400).json({ error: "No tracks available — select tracks to broadcast" });
    }
  });

  // Go offline — stop a channel
  api.post("/api/channels/:slug/stop", async (req, res) => {
    const { slug } = req.params;
    await stopChannel(slug);
    res.json({ ok: true, message: `Channel ${slug} is now offline` });
  });

  // Skip to a specific track (play immediately)
  api.post("/api/channels/:slug/skip", async (req, res) => {
    const { slug } = req.params;
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "filename required" });
    }

    const success = await skipToTrack(slug, filename);
    if (success) {
      res.json({ ok: true, message: `Now playing: ${filename}` });
    } else {
      res.status(400).json({ error: "Track not found or channel not active" });
    }
  });

  // Cue a track as next up
  api.post("/api/channels/:slug/cue", (req, res) => {
    const { slug } = req.params;
    const { filename } = req.body;

    if (!filename) {
      return res.status(400).json({ error: "filename required" });
    }

    const success = cueTrack(slug, filename);
    if (success) {
      res.json({ ok: true, message: `Cued: ${filename}` });
    } else {
      res.status(400).json({ error: "Track not found or channel not active" });
    }
  });

  // Get channel queue info
  api.get("/api/channels/:slug/queue", (req, res) => {
    const { slug } = req.params;
    const queue = getChannelQueue(slug);
    if (queue) {
      res.json(queue);
    } else {
      res.status(404).json({ error: "Channel not active" });
    }
  });

  // List active channels
  api.get("/api/channels/active", (_req, res) => {
    const channels = Array.from(getActiveChannels().entries()).map(([slug, ch]) => ({
      slug,
      broadcasterId: ch.broadcasterId,
    }));
    res.json(channels);
  });

  api.listen(API_PORT, "0.0.0.0", () => {
    console.log(`🔧 Channel API: http://0.0.0.0:${API_PORT}`);
  });

  console.log("\n🔥 Caster multi-channel server is live. All systems go.");
}

main().catch(console.error);

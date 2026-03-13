import express from "express";
import cors from "cors";
import type { Response } from "express";

interface NowPlayingState {
  track: {
    title: string;
    artist: string;
    album?: string;
  } | null;
  upcoming: { title: string; artist: string }[];
  duration: number;
  startedAt: number;
  trackStartOffset: number;
  ended: boolean;
}

// Per-channel state
const channelStates = new Map<string, NowPlayingState>();
const channelClients = new Map<string, Set<Response>>();

function getDefaultState(): NowPlayingState {
  return {
    track: null,
    upcoming: [],
    duration: 0,
    startedAt: 0,
    trackStartOffset: 0,
    ended: false,
  };
}

export function updateChannelNowPlaying(slug: string, state: Partial<NowPlayingState>) {
  const current = channelStates.get(slug) || getDefaultState();
  if (state.track) {
    state.startedAt = Date.now();
  }
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
  for (const client of clients) {
    client.write(data);
  }
}

export function startMetadataServer(port: number) {
  const app = express();
  app.use(cors());

  // Per-channel SSE endpoint
  app.get("/channels/:slug/now-playing", (req, res) => {
    const { slug } = req.params;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const state = channelStates.get(slug) || getDefaultState();
    res.write(`data: ${JSON.stringify(state)}\n\n`);

    if (!channelClients.has(slug)) {
      channelClients.set(slug, new Set());
    }
    channelClients.get(slug)!.add(res);

    req.on("close", () => {
      channelClients.get(slug)?.delete(res);
    });
  });

  // REST endpoints for per-channel state
  app.get("/api/channels/:slug/now-playing", (req, res) => {
    const state = channelStates.get(req.params.slug) || getDefaultState();
    res.json(state);
  });

  app.post("/api/channels/:slug/now-playing", express.json(), (req, res) => {
    updateChannelNowPlaying(req.params.slug, req.body);
    res.json({ ok: true });
  });

  // List all active channels
  app.get("/api/channels", (_req, res) => {
    const channels: Record<string, NowPlayingState> = {};
    for (const [slug, state] of channelStates) {
      channels[slug] = state;
    }
    res.json(channels);
  });

  app.listen(port, "0.0.0.0", () => {
    console.log(`📊 Metadata SSE: http://0.0.0.0:${port}/channels/{slug}/now-playing`);
  });

  // Heartbeat for all connected clients
  setInterval(() => {
    for (const clients of channelClients.values()) {
      for (const client of clients) {
        client.write(": heartbeat\n\n");
      }
    }
  }, 15000);
}

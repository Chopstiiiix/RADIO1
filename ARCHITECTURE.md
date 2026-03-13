# Radio1 - 24/7 AI-Powered Radio Station
## Architecture & Systems Analysis

---

## 1. Overview

A 24/7 internet radio station with:
- **AI DJ Broadcaster** (ElevenLabs voice, 8am-9pm daytime shifts)
- **Music & video asset hosting** on Cloudflare R2
- **Serverless event processing** via Cloudflare Workers
- **Next.js frontend** with the Discourse 102.4 FM broadcast monitor aesthetic
- **Node server network** for distributed hosting

---

## 2. System Architecture

```
                    +-------------------+
                    |   Next.js Frontend |  (Vercel / Node)
                    |   Radio Player UI  |
                    +--------+----------+
                             |
              +--------------+--------------+
              |                             |
     +--------v--------+        +----------v---------+
     | Cloudflare Worker|        | Cloudflare Worker  |
     | (Stream Proxy)   |        | (Schedule Engine)  |
     +--------+---------+        +----------+---------+
              |                             |
     +--------v--------+        +----------v---------+
     | Cloudflare R2    |        | AI DJ Service      |
     | (Media Storage)  |        | (ElevenLabs TTS)   |
     +-----------------+         +--------------------+
              |
     +--------v--------+
     | Icecast / HLS    |
     | Stream Server    |
     | (INSPIRE EDGE)   |
     +-----------------+
```

---

## 3. Core Components

### 3.1 Stream Server (INSPIRE EDGE - Node Network)
| Item | Detail |
|------|--------|
| Protocol | HLS (HTTP Live Streaming) for broad compatibility |
| Fallback | Icecast for legacy/direct stream clients |
| Node Process | `liquidsoap` or `ffmpeg` pipeline for continuous mixing |
| Uptime | PM2 process manager for 24/7 reliability |
| Port | 8000 (stream), bound to 0.0.0.0 |
| Tailscale | Accessible at 100.67.218.20:8000 across the network |

**Why HLS:** Works natively in browsers via `<audio>` / `hls.js`, no plugins needed. Segments cached on R2/CDN for resilience.

### 3.2 Cloudflare R2 (Media Storage)
| Item | Detail |
|------|--------|
| Bucket: `radio1-music` | FLAC/MP3 music files |
| Bucket: `radio1-clips` | Short video clips (MP4/WebM) |
| Bucket: `radio1-segments` | HLS .ts segments + .m3u8 playlists |
| Bucket: `radio1-voice` | Pre-generated AI DJ voice segments |
| Access | Cloudflare Workers bindings (no egress fees) |
| CDN | Automatic via Cloudflare edge network |

**Storage Estimates:**
- 1,000 tracks @ ~50MB FLAC = ~50GB
- 500 video clips @ ~20MB = ~10GB
- Voice segments (rolling 24h) = ~2GB
- HLS segments (rolling buffer) = ~5GB
- **Total: ~67GB** (R2 free tier: 10GB, then $0.015/GB/month)

### 3.3 Cloudflare Workers (Serverless Events)
| Worker | Purpose |
|--------|---------|
| `radio1-scheduler` | Manages playlist schedule, time-based programming |
| `radio1-stream-proxy` | Proxies HLS segments from R2 to listeners |
| `radio1-dj-trigger` | Triggers AI DJ segments at scheduled intervals |
| `radio1-metadata` | Serves now-playing info via WebSocket/SSE |
| `radio1-analytics` | Listener count, geo, session tracking |
| `radio1-upload` | Handles media uploads with auth |

**Workers Limits to Watch:**
- CPU time: 10ms (free) / 30s (paid, $5/mo Bundled)
- Subrequest limit: 50 per invocation
- KV for state: playlist position, listener count, schedule

### 3.4 AI DJ Broadcaster (ElevenLabs)
| Item | Detail |
|------|--------|
| Active Hours | 8:00 AM - 9:00 PM (13 hours) |
| Off-Hours | Automated playlists, no DJ voice (9PM-8AM) |
| Voice Model | ElevenLabs - custom cloned or preset voice |
| Trigger | Between tracks, on schedule events, news breaks |
| Content | Track intros, time checks, weather, listener shoutouts |
| Pre-generation | Batch common phrases, generate custom ones on-demand |
| Latency | ~1-3s for short TTS, pre-buffer 2 tracks ahead |

**ElevenLabs Cost Estimate:**
- ~200 DJ segments/day @ ~15 seconds each = ~50 min/day
- Starter plan: $5/mo (30 min) - insufficient
- Creator plan: $22/mo (100 min) - good fit
- **Recommendation: Creator plan ($22/mo)**

**DJ Script Engine:**
```
Schedule Trigger -> Generate Script (LLM) -> ElevenLabs TTS -> R2 Storage -> Insert into stream
```

### 3.5 Next.js Frontend (Player UI)
| Item | Detail |
|------|--------|
| Framework | Next.js 14+ (App Router) |
| Styling | Tailwind CSS (matching Discourse 102.4 FM theme) |
| Audio | HLS.js for stream playback |
| Visualizer | Canvas API waveform (from reference design) |
| Real-time | SSE or WebSocket for now-playing metadata |
| Video | Inline video player for clip segments |
| Hosting | Vercel (free tier) or self-hosted on INSPIRE EDGE |

**Design System (from reference):**
```css
--bg-base: #202020
--bg-panel: #2B2B2B
--bg-well: #161616
--bg-highlight: #1A2F3D
--text-primary: #F0F0F0
--text-secondary: #8C8C8C
--accent-blue: #78B3CE
--font-sans: 'Inter'
--font-mono: 'JetBrains Mono'
```

---

## 4. Data Flow

### 4.1 Music Playback Flow
```
1. Scheduler Worker reads playlist from KV/D1
2. Fetches next track metadata
3. Stream server pulls audio from R2
4. ffmpeg/liquidsoap encodes to HLS segments
5. Segments pushed to R2 (radio1-segments bucket)
6. Stream Proxy Worker serves segments to listeners
7. Metadata Worker broadcasts now-playing via SSE
8. Frontend updates UI in real-time
```

### 4.2 AI DJ Flow
```
1. DJ Trigger Worker fires on schedule (every 3-4 tracks)
2. Generates script via Claude API (track context, time, weather)
3. Sends script to ElevenLabs TTS API
4. Stores audio segment in R2 (radio1-voice bucket)
5. Stream server inserts voice segment between tracks
6. Frontend shows "DJ LIVE" indicator
```

### 4.3 Overnight Autopilot (9PM - 8AM)
```
1. Scheduler switches to overnight playlist
2. No DJ voice segments generated
3. Pre-recorded station IDs play every 30 min
4. Ambient/chill genre weighting
5. Lower analytics polling frequency
```

---

## 5. Tech Stack Summary

| Layer | Technology | Cost/Mo |
|-------|-----------|---------|
| Frontend | Next.js + Tailwind on Vercel | $0 (free tier) |
| Stream Server | ffmpeg + Node.js on INSPIRE EDGE | $0 (local) |
| Process Manager | PM2 | $0 |
| Media Storage | Cloudflare R2 (~70GB) | ~$1 |
| Serverless Logic | Cloudflare Workers (Bundled) | $5 |
| KV/State | Cloudflare KV | included |
| Database | Cloudflare D1 (playlist, schedule) | $0 (free tier) |
| AI DJ Voice | ElevenLabs Creator | $22 |
| DJ Script Gen | Claude API (Haiku) | ~$2 |
| Domain/DNS | Cloudflare | $0 |
| **Total** | | **~$30/mo** |

---

## 6. Project Structure

```
radio1/
├── ARCHITECTURE.md          # This file
├── package.json
├── .env.example             # API keys template
│
├── app/                     # Next.js frontend
│   ├── layout.tsx
│   ├── page.tsx             # Main radio player
│   ├── components/
│   │   ├── Player.tsx       # Audio player + HLS
│   │   ├── Visualizer.tsx   # Canvas waveform
│   │   ├── NowPlaying.tsx   # Track metadata
│   │   ├── Schedule.tsx     # Upcoming tracks
│   │   ├── Transport.tsx    # Play/pause/skip controls
│   │   └── Header.tsx       # Station branding + live dot
│   ├── hooks/
│   │   ├── useStream.ts     # HLS connection hook
│   │   └── useMetadata.ts   # SSE now-playing hook
│   └── styles/
│       └── globals.css      # Discourse theme tokens
│
├── server/                  # Stream server (INSPIRE EDGE)
│   ├── stream.ts            # HLS stream pipeline
│   ├── scheduler.ts         # Playlist scheduling engine
│   ├── dj-engine.ts         # AI DJ script + TTS orchestrator
│   └── metadata-server.ts   # SSE endpoint for now-playing
│
├── workers/                 # Cloudflare Workers
│   ├── stream-proxy/        # HLS segment proxy from R2
│   ├── scheduler/           # Playlist schedule manager
│   ├── dj-trigger/          # AI DJ event trigger
│   ├── metadata/            # Now-playing API
│   └── analytics/           # Listener tracking
│
├── scripts/                 # Utility scripts
│   ├── upload-tracks.ts     # Bulk upload to R2
│   ├── generate-playlist.ts # Auto-generate playlists
│   └── voice-cache.ts       # Pre-generate common DJ phrases
│
└── config/
    ├── schedule.json        # Programming schedule template
    ├── playlists/           # Playlist definitions
    └── dj-prompts/          # DJ personality & script templates
```

---

## 7. Required API Keys & Services

| Service | Key Needed | Env Var |
|---------|-----------|---------|
| ElevenLabs | API Key | `ELEVENLABS_API_KEY` |
| ElevenLabs | Voice ID | `ELEVENLABS_VOICE_ID` |
| Cloudflare | Account ID | `CF_ACCOUNT_ID` |
| Cloudflare | R2 Access Key | `R2_ACCESS_KEY_ID` |
| Cloudflare | R2 Secret Key | `R2_SECRET_ACCESS_KEY` |
| Cloudflare | Workers API Token | `CF_API_TOKEN` |
| Claude API | API Key | `ANTHROPIC_API_KEY` |

---

## 8. Dependencies

### Node/Next.js
```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.0.0",
    "hls.js": "^1.5.0",
    "tailwindcss": "^3.4.0",
    "@anthropic-ai/sdk": "^0.30.0",
    "eventsource": "^2.0.0"
  }
}
```

### Stream Server
```json
{
  "dependencies": {
    "fluent-ffmpeg": "^2.1.0",
    "pm2": "^5.3.0",
    "node-schedule": "^2.1.0",
    "elevenlabs": "^0.10.0",
    "@aws-sdk/client-s3": "^3.0.0"
  }
}
```

---

## 9. Scaling Considerations

| Listeners | Infra Needed |
|-----------|-------------|
| 1-50 | Single INSPIRE EDGE node, Cloudflare CDN |
| 50-500 | Add Cloudflare Stream or second node |
| 500-5000 | Full CDN distribution, multiple edge nodes |
| 5000+ | Dedicated streaming provider (e.g., Fastly) |

---

## 10. Phase 1 MVP Checklist

- [ ] Set up R2 buckets and upload test tracks
- [ ] Build HLS stream pipeline on INSPIRE EDGE
- [ ] Deploy stream-proxy Worker
- [ ] Build Next.js player with Discourse theme
- [ ] Implement now-playing SSE endpoint
- [ ] Integrate ElevenLabs for basic DJ intros
- [ ] Set up PM2 for 24/7 uptime
- [ ] Configure playlist scheduler
- [ ] Deploy to Vercel (frontend)

---

*Mixed and mastered. Ready to build when you say go, boss.*

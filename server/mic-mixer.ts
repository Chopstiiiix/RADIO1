// Live microphone mixer — receives mic audio via WebSocket, mixes with music stream
// Architecture: Browser mic → WebSocket → FIFO pipe → FFmpeg amix → HLS

import { WebSocketServer, WebSocket } from "ws";
import fs from "fs";
import path from "path";
import { spawn, execSync, type ChildProcess } from "child_process";
import type { Server } from "http";

const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");

interface MicSession {
  slug: string;
  fifoPath: string;
  fifoFd: number | null;
  ffmpegProc: ChildProcess | null;
  musicVolume: number; // 0-1
  micVolume: number;   // 0-1
}

const activeSessions = new Map<string, MicSession>();

/**
 * Create a named FIFO pipe for mic audio input
 */
function createFifo(fifoPath: string) {
  try {
    if (fs.existsSync(fifoPath)) fs.unlinkSync(fifoPath);
    execSync(`mkfifo "${fifoPath}"`);
  } catch (err) {
    console.error("Failed to create FIFO:", err);
  }
}

/**
 * Start the mic mixing FFmpeg process.
 * Takes the existing HLS stream + mic FIFO → remuxes with amix → overwrites HLS output.
 *
 * Instead of mixing into FFmpeg (complex), we use a simpler approach:
 * Write mic PCM to a file that the client-side can request separately,
 * OR we restart the main FFmpeg with an additional input.
 *
 * Simplest approach: Write mic audio as a separate HLS stream that the client mixes.
 */
export function setupMicWebSocket(server: Server) {
  const wss = new WebSocketServer({ server, path: "/ws/mic" });

  wss.on("connection", (ws: WebSocket, req) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const slug = url.searchParams.get("slug");

    if (!slug) {
      ws.close(4000, "slug required");
      return;
    }

    console.log(`🎤 [${slug}] Mic WebSocket connected`);

    const outputDir = path.join(BASE_OUTPUT_DIR, slug);
    const micDir = path.join(outputDir, "mic");
    fs.mkdirSync(micDir, { recursive: true });

    // Start a separate FFmpeg that encodes mic audio to HLS
    const micHlsPath = path.join(micDir, "mic.m3u8");
    const micSegPattern = path.join(micDir, "mic_%04d.m4s");
    const micInitPath = "mic_init.mp4";

    // Clean old mic segments
    if (fs.existsSync(micDir)) {
      for (const f of fs.readdirSync(micDir)) {
        fs.unlinkSync(path.join(micDir, f));
      }
    }

    // FFmpeg: read raw PCM from stdin → encode to HLS
    const ffmpeg = spawn("ffmpeg", [
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "1",
      "-i", "pipe:0",
      "-af", "aformat=channel_layouts=stereo:sample_rates=44100",
      "-c:a", "aac",
      "-b:a", "128k",
      "-f", "hls",
      "-hls_time", "1",
      "-hls_list_size", "6",
      "-hls_segment_type", "fmp4",
      "-hls_flags", "independent_segments+delete_segments",
      "-hls_fmp4_init_filename", micInitPath,
      "-hls_segment_filename", micSegPattern,
      micHlsPath,
    ], { stdio: ["pipe", "pipe", "pipe"] });

    ffmpeg.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString();
      if (msg.includes("Error") || msg.includes("error")) {
        console.error(`🎤 ffmpeg [${slug}]:`, msg.trim());
      }
    });

    ffmpeg.on("close", (code) => {
      console.log(`🎤 [${slug}] Mic FFmpeg exited with code ${code}`);
      activeSessions.delete(slug);
    });

    const session: MicSession = {
      slug,
      fifoPath: "",
      fifoFd: null,
      ffmpegProc: ffmpeg,
      musicVolume: 0.8,
      micVolume: 1.0,
    };
    activeSessions.set(slug, session);

    ws.on("message", (data: Buffer | string) => {
      if (typeof data === "string") {
        // Control message (volume changes)
        try {
          const msg = JSON.parse(data);
          if (msg.type === "volume") {
            if (msg.musicVolume !== undefined) session.musicVolume = msg.musicVolume;
            if (msg.micVolume !== undefined) session.micVolume = msg.micVolume;
          }
        } catch { /* ignore */ }
        return;
      }

      // Binary data — raw PCM audio from mic
      if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
        try {
          // Apply mic volume by scaling PCM samples
          const pcm = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
          const vol = session.micVolume;
          if (vol !== 1.0) {
            for (let i = 0; i < pcm.length; i++) {
              pcm[i] = Math.max(-32768, Math.min(32767, Math.round(pcm[i] * vol)));
            }
          }
          ffmpeg.stdin.write(Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength));
        } catch { /* ignore write errors */ }
      }
    });

    ws.on("close", () => {
      console.log(`🎤 [${slug}] Mic WebSocket disconnected`);
      if (ffmpeg.stdin && !ffmpeg.stdin.destroyed) {
        ffmpeg.stdin.end();
      }
      ffmpeg.kill("SIGTERM");
      activeSessions.delete(slug);
    });

    ws.on("error", (err) => {
      console.error(`🎤 [${slug}] Mic WebSocket error:`, err.message);
    });
  });

  console.log("🎤 Mic WebSocket server ready on /ws/mic");
}

/**
 * Start an HTTP-based mic session (for when WebSocket isn't available)
 * Called when the first audio chunk arrives via POST /api/mic/:slug
 */
export function startHttpMicSession(slug: string): MicSession | null {
  if (activeSessions.has(slug)) return activeSessions.get(slug)!;

  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  const micDir = path.join(outputDir, "mic");
  fs.mkdirSync(micDir, { recursive: true });

  // Clean old mic segments
  for (const f of fs.readdirSync(micDir)) {
    fs.unlinkSync(path.join(micDir, f));
  }

  const micHlsPath = path.join(micDir, "mic.m3u8");
  const micSegPattern = path.join(micDir, "mic_%04d.m4s");

  const ffmpeg = spawn("ffmpeg", [
    "-f", "s16le", "-ar", "44100", "-ac", "1", "-i", "pipe:0",
    "-af", "aformat=channel_layouts=stereo:sample_rates=44100",
    "-c:a", "aac", "-b:a", "128k",
    "-f", "hls", "-hls_time", "1", "-hls_list_size", "6",
    "-hls_segment_type", "fmp4",
    "-hls_flags", "independent_segments+delete_segments",
    "-hls_fmp4_init_filename", "mic_init.mp4",
    "-hls_segment_filename", micSegPattern,
    micHlsPath,
  ], { stdio: ["pipe", "pipe", "pipe"] });

  ffmpeg.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`🎤 ffmpeg [${slug}]:`, msg.trim());
    }
  });

  ffmpeg.on("close", (code) => {
    console.log(`🎤 [${slug}] Mic FFmpeg exited with code ${code}`);
    activeSessions.delete(slug);
  });

  const session: MicSession = {
    slug, fifoPath: "", fifoFd: null, ffmpegProc: ffmpeg, musicVolume: 0.8, micVolume: 1.0,
  };
  activeSessions.set(slug, session);
  console.log(`🎤 [${slug}] HTTP mic session started`);
  return session;
}

/**
 * Write audio data to an active mic session
 */
export function writeMicAudio(slug: string, data: Buffer): boolean {
  const session = activeSessions.get(slug);
  if (!session?.ffmpegProc?.stdin || session.ffmpegProc.stdin.destroyed) return false;
  try {
    session.ffmpegProc.stdin.write(data);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a mic session is active for a channel
 */
export function hasMicSession(slug: string): boolean {
  return activeSessions.has(slug);
}

/**
 * Stop a mic session
 */
export function stopMicSession(slug: string) {
  const session = activeSessions.get(slug);
  if (session?.ffmpegProc) {
    session.ffmpegProc.kill("SIGTERM");
  }
  activeSessions.delete(slug);
}

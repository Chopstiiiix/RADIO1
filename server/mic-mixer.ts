// Unified audio mixer — combines music PCM + mic PCM into single HLS output
//
// Architecture:
//   Music FFmpeg (raw PCM stdout) ---+
//                                    +--> Node.js mixer --> Output FFmpeg --> HLS
//   Mic HTTP POST (raw PCM) --------+
//
// Single stream.m3u8 for listeners — no separate mic stream.

import fs from "fs";
import path from "path";
import { spawn, type ChildProcess } from "child_process";

const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");

interface MixerSession {
  slug: string;
  outputProc: ChildProcess;
  musicConnected: boolean;
  micActive: boolean;
  micPending: Buffer[];
  micPendingBytes: number;
  musicVolume: number; // 0-1, controls broadcast music level
  micVolume: number;   // 0-1, controls broadcast mic level
  silenceInterval: ReturnType<typeof setInterval> | null;
}

const mixers = new Map<string, MixerSession>();

/**
 * Start the mixer — creates the output HLS FFmpeg process.
 * Call this once when a channel goes live.
 */
export function startMixer(slug: string): void {
  // Clean up existing mixer if any
  stopMixer(slug);

  const outputDir = path.join(BASE_OUTPUT_DIR, slug);
  fs.mkdirSync(outputDir, { recursive: true });

  // Clean old HLS segments
  for (const f of fs.readdirSync(outputDir)) {
    if (
      f.endsWith(".ts") ||
      f.endsWith(".m3u8") ||
      f.endsWith(".m4s") ||
      f === "init.mp4"
    ) {
      fs.unlinkSync(path.join(outputDir, f));
    }
  }

  // Remove legacy mic subdirectory
  const micDir = path.join(outputDir, "mic");
  if (fs.existsSync(micDir)) {
    for (const f of fs.readdirSync(micDir)) {
      fs.unlinkSync(path.join(micDir, f));
    }
    try { fs.rmdirSync(micDir); } catch { /* ignore */ }
  }

  // Output FFmpeg: raw stereo PCM stdin --> AAC HLS
  const outputProc = spawn(
    "ffmpeg",
    [
      "-f", "s16le",
      "-ar", "44100",
      "-ac", "2",
      "-i", "pipe:0",
      "-c:a", "aac",
      "-b:a", "256k",
      "-f", "hls",
      "-hls_time", "1",
      "-hls_list_size", "6",
      "-hls_segment_type", "fmp4",
      "-hls_flags", "independent_segments+delete_segments",
      "-hls_fmp4_init_filename", "init.mp4",
      "-hls_segment_filename", path.join(outputDir, "segment_%04d.m4s"),
      path.join(outputDir, "stream.m3u8"),
    ],
    { stdio: ["pipe", "pipe", "pipe"] },
  );

  outputProc.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`🔊 mixer ffmpeg [${slug}]:`, msg.trim());
    }
  });

  outputProc.on("close", (code) => {
    console.log(`🔊 [${slug}] Mixer FFmpeg exited with code ${code}`);
    mixers.delete(slug);
  });

  const session: MixerSession = {
    slug,
    outputProc,
    musicConnected: false,
    micActive: false,
    micPending: [],
    micPendingBytes: 0,
    musicVolume: 0.8,
    micVolume: 1.0,
    silenceInterval: null,
  };

  mixers.set(slug, session);

  // Prime FFmpeg with ~2 seconds of silence so it generates init.mp4 + first HLS segments.
  // Then keep a heartbeat every 500ms to prevent stdin starvation in voice-only mode.
  const STEREO_SILENCE_CHUNK = Buffer.alloc(44100 * 2 * 2); // 0.5s stereo s16le silence
  const stdin = outputProc.stdin;
  if (stdin && !stdin.destroyed) {
    // Initial prime: 2 seconds of silence
    for (let i = 0; i < 4; i++) {
      try { stdin.write(STEREO_SILENCE_CHUNK); } catch { break; }
    }
    // Heartbeat: keep FFmpeg fed in voice-only mode.
    // Even when mic is active, network latency causes gaps between chunks.
    // This heartbeat fills gaps so FFmpeg never starves.
    session.silenceInterval = setInterval(() => {
      if (session.musicConnected) return; // music source drives the data flow
      try { stdin.write(STEREO_SILENCE_CHUNK); } catch { /* ignore */ }
    }, 500);
  }

  console.log(`🔊 [${slug}] Mixer started — single HLS output`);
}

/**
 * Connect a music source (FFmpeg process with raw PCM on stdout) to the mixer.
 * Can be called multiple times (e.g. on auto-loop restart).
 */
export function connectMusicSource(slug: string, musicProc: ChildProcess): void {
  const session = mixers.get(slug);
  if (!session) return;

  session.musicConnected = true;

  musicProc.stdout?.on("data", (chunk: Buffer) => {
    const output = session.outputProc.stdin;
    if (!output || output.destroyed) return;

    if (!session.micActive || session.micPendingBytes === 0) {
      // No mic data — apply music volume and pass through
      if (session.musicVolume === 1.0) {
        try { output.write(chunk); } catch { /* ignore */ }
      } else {
        const scaled = applyVolume(chunk, session.musicVolume);
        try { output.write(scaled); } catch { /* ignore */ }
      }
    } else {
      // Mix music + mic
      const mixed = mixMusicAndMic(chunk, session);
      try { output.write(mixed); } catch { /* ignore */ }
    }
  });

  musicProc.on("close", () => {
    session.musicConnected = false;
  });
}

/**
 * Write mic audio (mono s16le 44100Hz) into the mixer.
 * Called on every HTTP POST from the broadcaster's mic.
 */
export function writeMicAudio(slug: string, data: Buffer): boolean {
  const session = mixers.get(slug);
  if (!session) return false;

  session.micActive = true;

  if (!session.musicConnected) {
    // Voice-only mode: convert mono to stereo and write directly to output
    const stereo = monoToStereo(data);
    const output = session.outputProc.stdin;
    if (!output || output.destroyed) return false;
    try {
      output.write(stereo);
      return true;
    } catch {
      return false;
    }
  }

  // Music is flowing — buffer mic data, it gets mixed on the next music chunk
  session.micPending.push(data);
  session.micPendingBytes += data.length;

  // Cap buffer at ~2 seconds of mono audio (2 * 44100 * 2 bytes = 176400)
  while (session.micPendingBytes > 176400) {
    const removed = session.micPending.shift();
    if (removed) session.micPendingBytes -= removed.length;
  }

  return true;
}

/**
 * Update broadcast volume levels.
 * musicVolume/micVolume are 0-1 floats controlling the mix sent to listeners.
 */
export function setMixerVolumes(slug: string, musicVolume?: number, micVolume?: number): boolean {
  const session = mixers.get(slug);
  if (!session) return false;
  if (musicVolume !== undefined) session.musicVolume = Math.max(0, Math.min(1, musicVolume));
  if (micVolume !== undefined) session.micVolume = Math.max(0, Math.min(1, micVolume));
  return true;
}

/**
 * Stop mic input but keep the mixer running for music.
 */
export function stopMicInput(slug: string): void {
  const session = mixers.get(slug);
  if (session) {
    session.micActive = false;
    session.micPending = [];
    session.micPendingBytes = 0;
  }
}

/**
 * Stop the mixer entirely (on channel stop).
 */
export function stopMixer(slug: string): void {
  const session = mixers.get(slug);
  if (!session) return;

  if (session.silenceInterval) clearInterval(session.silenceInterval);
  if (session.outputProc.stdin && !session.outputProc.stdin.destroyed) {
    session.outputProc.stdin.end();
  }
  session.outputProc.kill("SIGTERM");
  mixers.delete(slug);
}

/**
 * Check if a mixer exists for a channel.
 */
export function hasMixer(slug: string): boolean {
  return mixers.has(slug);
}

// ── Internal helpers ──

/** Convert mono s16le PCM to stereo by duplicating each sample. */
function monoToStereo(mono: Buffer): Buffer {
  const samples = mono.length / 2;
  const stereo = Buffer.alloc(samples * 4);
  for (let i = 0; i < samples; i++) {
    const sample = mono.readInt16LE(i * 2);
    stereo.writeInt16LE(sample, i * 4);
    stereo.writeInt16LE(sample, i * 4 + 2);
  }
  return stereo;
}

/** Scale all s16le samples in a buffer by a volume factor (0-1). */
function applyVolume(buf: Buffer, vol: number): Buffer {
  const out = Buffer.alloc(buf.length);
  const count = buf.length / 2;
  for (let i = 0; i < count; i++) {
    const val = Math.round(buf.readInt16LE(i * 2) * vol);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
  }
  return out;
}

/**
 * Mix a music chunk (stereo s16le) with pending mic data (mono s16le).
 * Volume levels are controlled by the broadcaster via setMixerVolumes.
 */
function mixMusicAndMic(musicChunk: Buffer, session: MixerSession): Buffer {
  // For N bytes of stereo music we need N/2 bytes of mono mic
  const neededMicBytes = musicChunk.length / 2;
  const micData = drainMicBuffer(session, neededMicBytes);

  if (micData.length === 0) return musicChunk;

  const stereoMic = monoToStereo(micData);
  const mixed = Buffer.alloc(musicChunk.length);
  const sampleCount = musicChunk.length / 2; // total s16 samples (L+R interleaved)
  const micSampleCount = stereoMic.length / 2;

  const mVol = session.musicVolume;
  const vVol = session.micVolume;

  for (let i = 0; i < sampleCount; i++) {
    const music = musicChunk.readInt16LE(i * 2);
    const mic = i < micSampleCount ? stereoMic.readInt16LE(i * 2) : 0;
    const val = Math.round(music * mVol + mic * vVol);
    mixed.writeInt16LE(Math.max(-32768, Math.min(32767, val)), i * 2);
  }

  return mixed;
}

/** Drain up to `bytes` from the pending mic buffer. */
function drainMicBuffer(session: MixerSession, bytes: number): Buffer {
  if (session.micPendingBytes === 0) return Buffer.alloc(0);

  const chunks: Buffer[] = [];
  let collected = 0;

  while (session.micPending.length > 0 && collected < bytes) {
    const chunk = session.micPending[0];
    const needed = bytes - collected;

    if (chunk.length <= needed) {
      chunks.push(chunk);
      collected += chunk.length;
      session.micPending.shift();
      session.micPendingBytes -= chunk.length;
    } else {
      chunks.push(chunk.subarray(0, needed));
      session.micPending[0] = chunk.subarray(needed);
      session.micPendingBytes -= needed;
      collected += needed;
    }
  }

  return Buffer.concat(chunks);
}

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { spawn, execSync } from "child_process";
import { EventEmitter } from "events";

const BASE_OUTPUT_DIR = path.join(process.cwd(), "stream-output");

export interface ChannelConfig {
  slug: string;
  musicDir: string;
  outputDir: string;
}

export interface TrackFile {
  path: string;
  filename: string;
  duration: number;
}

export const streamEvents = new EventEmitter();

// Per-channel ffmpeg processes
const channelProcesses = new Map<string, ReturnType<typeof spawn>>();

/**
 * Normalize a single track to WAV s16le stereo 44100Hz.
 * Returns the path to the normalized file.
 */
function normalizeTrack(srcPath: string, normDir: string): string {
  const basename = path.basename(srcPath, path.extname(srcPath)) + ".wav";
  const normPath = path.join(normDir, basename);

  // Skip if already normalized
  if (fs.existsSync(normPath)) return normPath;

  try {
    execSync(
      `ffmpeg -y -i "${srcPath}" -af "aformat=channel_layouts=stereo:sample_rates=44100:sample_fmts=s16" -c:a pcm_s16le "${normPath}"`,
      { encoding: "utf-8", stdio: "pipe" }
    );
  } catch (err) {
    console.error(`Failed to normalize ${srcPath}:`, err);
    return srcPath; // Fallback to original
  }

  return normPath;
}

function getTrackFiles(musicDir: string): TrackFile[] {
  if (!fs.existsSync(musicDir)) return [];

  // Normalize all tracks to a uniform format for clean concat
  const normDir = path.join(musicDir, "_normalized");
  fs.mkdirSync(normDir, { recursive: true });

  const sourceFiles = fs
    .readdirSync(musicDir)
    .filter((f) => /\.(mp3|flac|wav|m4a|ogg)$/i.test(f))
    .sort();

  return sourceFiles.map((f) => {
    const srcPath = path.join(musicDir, f);
    const normPath = normalizeTrack(srcPath, normDir);

    let duration = 180;
    try {
      const out = execSync(
        `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${normPath}"`,
        { encoding: "utf-8" }
      ).trim();
      const parsed = parseFloat(out);
      if (parsed > 0) duration = parsed;
    } catch { /* fallback */ }

    return { path: normPath, filename: f, duration };
  });
}

function generateConcatFile(tracks: TrackFile[], outputDir: string): string {
  const concatPath = path.join(outputDir, "playlist.txt");
  const content = tracks.map((t) => `file '${t.path}'`).join("\n");
  fs.writeFileSync(concatPath, content);
  return concatPath;
}

export function getChannelTracks(musicDir: string): TrackFile[] {
  return getTrackFiles(musicDir);
}

export function startChannelPipelineFromTracks(config: ChannelConfig, tracks: TrackFile[]): TrackFile[] {
  const { slug, musicDir, outputDir } = config;

  // Clean old segments
  if (fs.existsSync(outputDir)) {
    for (const f of fs.readdirSync(outputDir)) {
      if (f.endsWith(".ts") || f.endsWith(".m3u8") || f.endsWith(".m4s") || f === "init.mp4") {
        fs.unlinkSync(path.join(outputDir, f));
      }
    }
  }

  if (tracks.length === 0) {
    console.log(`⚠️  No tracks for channel ${slug}`);
    return [];
  }

  // Ensure all tracks are normalized before concat
  const normDir = path.join(musicDir, "_normalized");
  fs.mkdirSync(normDir, { recursive: true });
  const normalizedTracks = tracks.map((t) => {
    // Skip if already in the normalized dir
    if (t.path.includes("_normalized")) return t;
    const normPath = normalizeTrack(t.path, normDir);
    return { ...t, path: normPath };
  });

  const concatFile = generateConcatFile(normalizedTracks, outputDir);

  return launchFfmpeg(slug, outputDir, concatFile, normalizedTracks);
}

export function startChannelPipeline(config: ChannelConfig): TrackFile[] {
  const { slug, musicDir, outputDir } = config;

  // Clean old segments
  if (fs.existsSync(outputDir)) {
    for (const f of fs.readdirSync(outputDir)) {
      if (f.endsWith(".ts") || f.endsWith(".m3u8") || f.endsWith(".m4s") || f === "init.mp4") {
        fs.unlinkSync(path.join(outputDir, f));
      }
    }
  }

  const tracks = getTrackFiles(musicDir);
  if (tracks.length === 0) {
    console.log(`⚠️  No tracks in ${musicDir} for channel ${slug}`);
    return [];
  }

  const concatFile = generateConcatFile(tracks, outputDir);

  return launchFfmpeg(slug, outputDir, concatFile, tracks);
}

function launchFfmpeg(slug: string, outputDir: string, concatFile: string, tracks: TrackFile[]): TrackFile[] {
  const args = [
    "-re",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    // Normalize audio: force stereo, 44.1kHz, 16-bit — fixes channel noise
    // from WAV files with unknown channel layouts or mismatched bit depths
    "-af", "aformat=channel_layouts=stereo:sample_rates=44100:sample_fmts=s16",
    "-c:a", "flac",
    "-f", "hls",
    "-hls_time", "4",
    "-hls_list_size", "0",
    "-hls_segment_type", "fmp4",
    "-hls_flags", "independent_segments",
    "-hls_fmp4_init_filename", "init.mp4",
    "-hls_segment_filename", path.join(outputDir, "segment_%04d.m4s"),
    path.join(outputDir, "stream.m3u8"),
  ];

  const proc = spawn("ffmpeg", args, { stdio: "pipe" });

  proc.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`ffmpeg [${slug}]:`, msg.trim());
    }
  });

  proc.on("close", (code) => {
    console.log(`ffmpeg [${slug}] exited with code ${code}`);
    channelProcesses.delete(slug);
    // Auto-loop: restart the pipeline when all tracks finish
    streamEvents.emit("ended", slug);
  });

  proc.on("error", (err) => {
    console.error(`ffmpeg [${slug}] error:`, err.message);
  });

  channelProcesses.set(slug, proc);

  console.log(`🎵 [${slug}] HLS pipeline started — FLAC lossless, ${tracks.length} tracks`);
  for (const t of tracks) {
    console.log(`   ${t.filename} — ${Math.round(t.duration)}s`);
  }

  return tracks;
}

export function stopChannelPipeline(slug: string) {
  const proc = channelProcesses.get(slug);
  if (proc) {
    proc.kill("SIGTERM");
    channelProcesses.delete(slug);
  }
}

export function startStreamServer(port: number) {
  const app = express();
  app.use(cors());

  // Serve per-channel streams: /{slug}/stream.m3u8
  app.use("/:slug", (req, res, next) => {
    const slug = req.params.slug;
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

  app.listen(port, "0.0.0.0", () => {
    console.log(`📡 Stream server: http://0.0.0.0:${port}`);
  });
}

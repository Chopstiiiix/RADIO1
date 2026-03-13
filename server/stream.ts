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

function getTrackFiles(musicDir: string): TrackFile[] {
  if (!fs.existsSync(musicDir)) return [];
  return fs
    .readdirSync(musicDir)
    .filter((f) => /\.(mp3|flac|wav|m4a|ogg)$/i.test(f))
    .sort()
    .map((f) => {
      const fullPath = path.join(musicDir, f);
      let duration = 180;
      try {
        const out = execSync(
          `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${fullPath}"`,
          { encoding: "utf-8" }
        ).trim();
        const parsed = parseFloat(out);
        if (parsed > 0) duration = parsed;
      } catch { /* fallback */ }
      return { path: fullPath, filename: f, duration };
    });
}

function generateConcatFile(tracks: TrackFile[], outputDir: string): string {
  const concatPath = path.join(outputDir, "playlist.txt");
  const content = tracks.map((t) => `file '${t.path}'`).join("\n");
  fs.writeFileSync(concatPath, content);
  return concatPath;
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

  const args = [
    "-re",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
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

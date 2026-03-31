import path from "path";
import fs from "fs";
import { spawn, execSync, type ChildProcess } from "child_process";
import { EventEmitter } from "events";

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

export interface PipelineResult {
  tracks: TrackFile[];
  process: ChildProcess;
}

export const streamEvents = new EventEmitter();

// Per-channel music decoder processes
const channelProcesses = new Map<string, ChildProcess>();

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

export function startChannelPipelineFromTracks(config: ChannelConfig, tracks: TrackFile[]): PipelineResult | null {
  const { slug, musicDir, outputDir } = config;

  fs.mkdirSync(outputDir, { recursive: true });

  if (tracks.length === 0) {
    console.log(`⚠️  No tracks for channel ${slug}`);
    return null;
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

  return launchMusicDecoder(slug, concatFile, normalizedTracks);
}

export function startChannelPipeline(config: ChannelConfig): PipelineResult | null {
  const { slug, musicDir, outputDir } = config;

  fs.mkdirSync(outputDir, { recursive: true });

  const tracks = getTrackFiles(musicDir);
  if (tracks.length === 0) {
    console.log(`⚠️  No tracks in ${musicDir} for channel ${slug}`);
    return null;
  }

  const concatFile = generateConcatFile(tracks, outputDir);

  return launchMusicDecoder(slug, concatFile, tracks);
}

/**
 * Launch FFmpeg to decode the concat playlist into raw PCM on stdout.
 * The PCM is piped into the unified mixer which produces HLS.
 */
function launchMusicDecoder(slug: string, concatFile: string, tracks: TrackFile[]): PipelineResult {
  const args = [
    "-re",
    "-f", "concat",
    "-safe", "0",
    "-i", concatFile,
    // Normalize: stereo, 44.1kHz, 16-bit
    "-af", "aformat=channel_layouts=stereo:sample_rates=44100:sample_fmts=s16",
    "-f", "s16le",
    "-acodec", "pcm_s16le",
    "pipe:1",
  ];

  const proc = spawn("ffmpeg", args, { stdio: ["pipe", "pipe", "pipe"] });

  proc.stderr?.on("data", (data: Buffer) => {
    const msg = data.toString();
    if (msg.includes("Error") || msg.includes("error")) {
      console.error(`ffmpeg [${slug}]:`, msg.trim());
    }
  });

  proc.on("close", (code) => {
    console.log(`ffmpeg [${slug}] exited with code ${code}`);
    channelProcesses.delete(slug);
    // Auto-loop: signal that playlist ended
    streamEvents.emit("ended", slug);
  });

  proc.on("error", (err) => {
    console.error(`ffmpeg [${slug}] error:`, err.message);
  });

  channelProcesses.set(slug, proc);

  console.log(`🎵 [${slug}] Music decoder started — ${tracks.length} tracks (raw PCM → mixer)`);
  for (const t of tracks) {
    console.log(`   ${t.filename} — ${Math.round(t.duration)}s`);
  }

  return { tracks, process: proc };
}

export function stopChannelPipeline(slug: string) {
  const proc = channelProcesses.get(slug);
  if (proc) {
    proc.kill("SIGTERM");
    channelProcesses.delete(slug);
  }
}

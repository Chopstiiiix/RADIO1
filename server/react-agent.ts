// ReAct Agent Engine for AI Radio Host System
// Observe -> Think -> Action -> Reflect loop
// Generates radio host dialogue and converts to audio via Claude + ElevenLabs

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { supabase } from "./supabase";

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

export interface TrackContext {
  title: string;
  artist: string;
  producer?: string;
  featuredArtists?: string[];
  genre?: string[];
  sampledMusic?: string;
  recordLabel?: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  personality: string;
  voice_id: string;
  catchphrases: string[];
  role: "primary" | "cohost";
}

export interface HostSegment {
  speaker: string;
  text: string;
  voice_id: string;
}

export interface GeneratedSegment {
  audioPath: string;
  duration: number;
  speakers: string[];
  type: "track_intro" | "track_outro" | "ad_intro" | "ad_outro";
}

// ---------------------------------------------------------------------------
// Helper: Parse Claude dialogue response into HostSegments
// ---------------------------------------------------------------------------

function parseDialogue(text: string, agents: AgentProfile[]): HostSegment[] {
  const segments: HostSegment[] = [];
  const lines = text.split("\n").filter((l) => l.trim());

  // Build a lookup: uppercased agent name -> AgentProfile
  const agentMap = new Map<string, AgentProfile>();
  for (const agent of agents) {
    agentMap.set(agent.name.toUpperCase(), agent);
  }

  for (const line of lines) {
    // Match "AgentName: dialogue text" (case-insensitive on name)
    const match = line.match(/^([A-Za-z0-9_\- ]+):\s*(.+)/);
    if (!match) continue;

    const speakerKey = match[1].trim().toUpperCase();
    const dialogueText = match[2].trim();
    const agent = agentMap.get(speakerKey);

    if (agent && dialogueText.length > 0) {
      segments.push({
        speaker: agent.name,
        text: dialogueText,
        voice_id: agent.voice_id,
      });
    }
  }

  return segments;
}

// ---------------------------------------------------------------------------
// Helper: Convert HostSegments to a single audio file via ElevenLabs TTS
// Returns duration in seconds
// ---------------------------------------------------------------------------

async function segmentsToAudioFile(
  segments: HostSegment[],
  outputPath: string
): Promise<number> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    console.warn("🎙️ ELEVENLABS_API_KEY not set -- TTS disabled");
    return 0;
  }

  const audioBuffers: Buffer[] = [];

  for (const segment of segments) {
    // Skip placeholder voice IDs
    if (segment.voice_id.startsWith("PLACEHOLDER") || segment.voice_id.endsWith("_PLACEHOLDER")) {
      console.log(`🎙️ Placeholder voice ID for ${segment.speaker} -- skipping TTS`);
      continue;
    }

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${segment.voice_id}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "xi-api-key": apiKey,
          },
          body: JSON.stringify({
            text: segment.text,
            model_id: "eleven_turbo_v2_5",
            voice_settings: {
              stability: 0.5,
              similarity_boost: 0.75,
            },
          }),
        }
      );

      if (response.ok) {
        const arrayBuffer = await response.arrayBuffer();
        audioBuffers.push(Buffer.from(arrayBuffer));
      } else {
        console.error(
          `🎙️ TTS failed for ${segment.speaker} (${response.status}): ${response.statusText}`
        );
      }
    } catch (err) {
      console.error(`🎙️ TTS request failed for ${segment.speaker}:`, err);
    }
  }

  if (audioBuffers.length === 0) return 0;

  // Concatenate all audio buffers and write to file
  const combined = Buffer.concat(audioBuffers);
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(outputPath, combined);

  // Get duration via ffprobe
  let duration = 0;
  try {
    const out = execSync(
      `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${outputPath}"`,
      { encoding: "utf-8" }
    ).trim();
    const parsed = parseFloat(out);
    if (parsed > 0) duration = parsed;
  } catch {
    // Estimate from buffer size (MP3 ~16kB/s at 128kbps)
    duration = combined.length / 16000;
  }

  return duration;
}

// ---------------------------------------------------------------------------
// Database helpers
// ---------------------------------------------------------------------------

/**
 * Get the AI agents a broadcaster has subscribed to, with their assigned roles.
 * Returns agents sorted so that the primary host comes first.
 */
export async function getBroadcasterAgents(
  broadcasterId: string
): Promise<AgentProfile[]> {
  const { data, error } = await supabase
    .from("agent_subscriptions")
    .select(
      `
      role,
      agent:ai_agents(id, name, personality, voice_id, catchphrases)
    `
    )
    .eq("broadcaster_id", broadcasterId)
    .eq("status", "active");

  if (error || !data || data.length === 0) return [];

  const agents: AgentProfile[] = (data as any[]).map((row) => ({
    id: row.agent.id,
    name: row.agent.name,
    personality: row.agent.personality,
    voice_id: row.agent.voice_id,
    catchphrases: row.agent.catchphrases || [],
    role: row.role as "primary" | "cohost",
  }));

  // Primary first, then co-hosts
  agents.sort((a, b) => (a.role === "primary" ? -1 : b.role === "primary" ? 1 : 0));

  return agents;
}

/**
 * Check if a broadcaster has AI host enabled in their config.
 */
export async function isAiHostEnabled(
  broadcasterId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("broadcaster_agent_configs")
    .select("ai_host_enabled")
    .eq("broadcaster_id", broadcasterId)
    .single();

  if (error || !data) return false;
  return data.ai_host_enabled === true;
}

// ---------------------------------------------------------------------------
// Core ReAct Loop: generateHostAudio
// ---------------------------------------------------------------------------

export async function generateHostAudio(
  slug: string,
  agents: AgentProfile[],
  outgoing: TrackContext | null,
  incoming: TrackContext,
  options?: {
    isAdIntro?: boolean;
    adTitle?: string;
    segmentDir?: string;
    maxDurationSeconds?: number;
  }
): Promise<GeneratedSegment | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("🎙️ ANTHROPIC_API_KEY not set -- AI host disabled");
    return null;
  }

  if (agents.length === 0) {
    console.warn("🎙️ No agents provided -- skipping host segment");
    return null;
  }

  const maxDuration = options?.maxDurationSeconds ?? 30;
  const segmentDir =
    options?.segmentDir ?? path.join(process.cwd(), "music", slug, "_host_segments");
  const isAdIntro = options?.isAdIntro ?? false;
  const adTitle = options?.adTitle;

  // Determine segment type
  const segmentType: GeneratedSegment["type"] = isAdIntro
    ? "ad_intro"
    : outgoing
      ? "track_intro"
      : "track_intro";

  const isSolo = agents.length === 1;
  const primary = agents[0];

  // -----------------------------------------------------------------------
  // STEP 1 -- OBSERVE
  // -----------------------------------------------------------------------
  console.log(`🎙️ [${slug}] OBSERVE -- Building context`);
  console.log(
    `🎙️ [${slug}]   Agents: ${agents.map((a) => `${a.name} (${a.role})`).join(", ")}`
  );
  if (outgoing) {
    console.log(`🎙️ [${slug}]   Outgoing: "${outgoing.title}" by ${outgoing.artist}`);
  }
  console.log(`🎙️ [${slug}]   Incoming: "${incoming.title}" by ${incoming.artist}`);
  if (isAdIntro) {
    console.log(`🎙️ [${slug}]   Ad intro for: "${adTitle}"`);
  }

  // -----------------------------------------------------------------------
  // STEP 2 -- THINK (Claude generates dialogue)
  // -----------------------------------------------------------------------
  console.log(`🎙️ [${slug}] THINK -- Generating dialogue`);

  const agentDescriptions = agents
    .map(
      (a) =>
        `${a.name} (${a.role}): ${a.personality}\nCatchphrases: ${a.catchphrases.join(", ")}`
    )
    .join("\n\n");

  // Build track detail strings
  const incomingDetails = buildTrackDetails(incoming);
  const outgoingDetails = outgoing ? buildTrackDetails(outgoing) : "";

  let prompt: string;

  if (isAdIntro) {
    prompt = `You are writing a short radio host ${isSolo ? "monologue" : "conversation"} for an AI radio station.

${agentDescriptions}

They are about to introduce a short ad break. The ad is for: "${adTitle}"
After the ad, the next song will be "${incoming.title}" by ${incoming.artist}.

Write a ${isSolo ? "monologue (2-3 sentences)" : "natural, short 3-5 line conversation"} that smoothly transitions to the ad break.
${isSolo ? `Format each line as: ${primary.name}: <text>` : `Format each line as: AGENT_NAME: <text>\nThe primary host (${primary.name}) should lead.`}
Keep it casual and warm. No hashtags, no emojis. Reference the upcoming music to build anticipation.`;
  } else if (outgoing) {
    prompt = `You are writing a short radio host ${isSolo ? "monologue" : "conversation"} for an AI radio station.

${agentDescriptions}

They just finished playing: "${outgoing.title}" by ${outgoing.artist}${outgoingDetails}
Next up: "${incoming.title}" by ${incoming.artist}${incomingDetails}

Write a ${isSolo ? "monologue (2-3 sentences)" : "natural, short 3-5 line conversation"} transitioning between tracks. Reference specific details about the music -- production, samples, history, vibes.
${isSolo ? `Format each line as: ${primary.name}: <text>` : `Format each line as: AGENT_NAME: <text>\nThe primary host (${primary.name}) should lead and co-hosts should respond naturally.`}
Keep it casual and warm. No hashtags, no emojis.`;
  } else {
    // Opening -- no outgoing track
    prompt = `You are writing a short radio host ${isSolo ? "monologue" : "conversation"} for an AI radio station.

${agentDescriptions}

They are introducing the first track of the broadcast: "${incoming.title}" by ${incoming.artist}${incomingDetails}

Write a ${isSolo ? "monologue (2-3 sentences)" : "natural, short 3-5 line conversation"} to introduce this track and welcome listeners.
${isSolo ? `Format each line as: ${primary.name}: <text>` : `Format each line as: AGENT_NAME: <text>\nThe primary host (${primary.name}) should lead.`}
Keep it casual and warm. No hashtags, no emojis.`;
  }

  let dialogueSegments: HostSegment[];

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    if (!text) {
      console.error("🎙️ Claude returned empty response");
      return null;
    }

    dialogueSegments = parseDialogue(text, agents);

    if (dialogueSegments.length === 0) {
      console.warn("🎙️ No dialogue lines parsed from Claude response");
      console.warn(`🎙️ Raw response: ${text.substring(0, 200)}`);
      return null;
    }

    // Log the script
    for (const seg of dialogueSegments) {
      console.log(`🎙️ [${slug}]   ${seg.speaker}: ${seg.text}`);
    }
  } catch (err) {
    console.error("🎙️ Claude API call failed:", err);
    return null;
  }

  // -----------------------------------------------------------------------
  // STEP 3 -- ACTION (TTS + write audio file)
  // -----------------------------------------------------------------------
  console.log(`🎙️ [${slug}] ACTION -- Converting to audio`);

  const filename = `${Date.now()}_${segmentType}.mp3`;
  const outputPath = path.join(segmentDir, filename);

  const duration = await segmentsToAudioFile(dialogueSegments, outputPath);

  if (duration === 0) {
    console.warn("🎙️ No audio generated (TTS may be disabled or failed)");
    return null;
  }

  // -----------------------------------------------------------------------
  // STEP 4 -- REFLECT
  // -----------------------------------------------------------------------
  const speakers = [...new Set(dialogueSegments.map((s) => s.speaker))];

  if (duration > maxDuration) {
    console.warn(
      `🎙️ [${slug}] REFLECT -- Segment is ${Math.round(duration)}s (exceeds ${maxDuration}s cap). Will request shorter dialogue next time.`
    );
  } else {
    console.log(
      `🎙️ [${slug}] REFLECT -- Segment OK: ${Math.round(duration)}s, ${speakers.length} speaker(s)`
    );
  }

  const result: GeneratedSegment = {
    audioPath: outputPath,
    duration,
    speakers,
    type: segmentType,
  };

  console.log(`🎙️ [${slug}] Segment saved: ${outputPath}`);

  return result;
}

// ---------------------------------------------------------------------------
// Pre-generate all host segments for a playlist
// ---------------------------------------------------------------------------

/**
 * Pre-generate host audio segments for every track transition in a playlist.
 * Returns a map of trackIndex -> GeneratedSegment that plays BEFORE that track.
 */
export async function pregenerateHostSegments(
  slug: string,
  broadcasterId: string,
  tracks: { filename: string; title: string; artist: string; duration: number }[],
  segmentDir: string
): Promise<Map<number, GeneratedSegment>> {
  const results = new Map<number, GeneratedSegment>();

  // Check if AI host is enabled for this broadcaster
  const enabled = await isAiHostEnabled(broadcasterId);
  if (!enabled) {
    console.log(`🎙️ [${slug}] AI host not enabled for broadcaster -- skipping`);
    return results;
  }

  // Get the broadcaster's agents
  const agents = await getBroadcasterAgents(broadcasterId);
  if (agents.length === 0) {
    console.log(`🎙️ [${slug}] No active agents for broadcaster -- skipping`);
    return results;
  }

  console.log(
    `🎙️ [${slug}] Pre-generating host segments for ${tracks.length} tracks with ${agents.length} agent(s)`
  );

  // Fetch full track metadata from DB for richer dialogue
  const metadataMap = await loadTrackMetadata(broadcasterId);

  // Ensure segment directory exists
  if (!fs.existsSync(segmentDir)) {
    fs.mkdirSync(segmentDir, { recursive: true });
  }

  for (let i = 0; i < tracks.length; i++) {
    const incoming = tracks[i];
    const outgoing = i > 0 ? tracks[i - 1] : null;

    const incomingContext = enrichTrackContext(incoming, metadataMap);
    const outgoingContext = outgoing ? enrichTrackContext(outgoing, metadataMap) : null;

    try {
      const segment = await generateHostAudio(slug, agents, outgoingContext, incomingContext, {
        segmentDir,
      });

      if (segment) {
        results.set(i, segment);
      }
    } catch (err) {
      console.error(`🎙️ [${slug}] Failed to generate segment for track ${i}:`, err);
      // Continue with remaining tracks -- broadcast shouldn't fail
    }
  }

  console.log(
    `🎙️ [${slug}] Pre-generation complete: ${results.size}/${tracks.length} segments created`
  );

  return results;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a detail string for track metadata used in prompts.
 */
function buildTrackDetails(track: TrackContext): string {
  const parts: string[] = [];
  if (track.producer) parts.push(`produced by ${track.producer}`);
  if (track.featuredArtists?.length) parts.push(`feat. ${track.featuredArtists.join(", ")}`);
  if (track.genre?.length) parts.push(`[${track.genre.join(", ")}]`);
  if (track.sampledMusic) parts.push(`samples "${track.sampledMusic}"`);
  if (track.recordLabel) parts.push(`on ${track.recordLabel}`);
  return parts.length > 0 ? ` (${parts.join(" | ")})` : "";
}

interface TrackMetadataRow {
  title: string;
  primary_artist: string;
  producer?: string;
  featured_artists?: string[];
  genre?: string[];
  sampled_music?: string;
  record_label?: string;
}

/**
 * Load full track metadata for a broadcaster from the tracks table.
 * Returns a map keyed by uppercased title for easy lookup.
 */
async function loadTrackMetadata(
  broadcasterId: string
): Promise<Map<string, TrackMetadataRow>> {
  const map = new Map<string, TrackMetadataRow>();

  const { data, error } = await supabase
    .from("tracks")
    .select(
      "title, primary_artist, producer, featured_artists, genre, sampled_music, record_label"
    )
    .eq("broadcaster_id", broadcasterId)
    .eq("is_active", true);

  if (error || !data) return map;

  for (const row of data as TrackMetadataRow[]) {
    map.set(row.title.toUpperCase(), row);
  }

  return map;
}

/**
 * Enrich a basic track object with full metadata from the DB.
 */
function enrichTrackContext(
  track: { filename: string; title: string; artist: string; duration: number },
  metadataMap: Map<string, TrackMetadataRow>
): TrackContext {
  const dbRow = metadataMap.get(track.title.toUpperCase());

  if (dbRow) {
    return {
      title: dbRow.title,
      artist: dbRow.primary_artist,
      producer: dbRow.producer ?? undefined,
      featuredArtists: dbRow.featured_artists ?? undefined,
      genre: dbRow.genre ?? undefined,
      sampledMusic: dbRow.sampled_music ?? undefined,
      recordLabel: dbRow.record_label ?? undefined,
    };
  }

  // Fallback: just use what we have
  return {
    title: track.title,
    artist: track.artist,
  };
}

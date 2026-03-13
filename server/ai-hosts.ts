// Dual AI Host conversation pipeline
// Generates two-speaker radio conversations using Claude + ElevenLabs

import fs from "fs";
import path from "path";
import { supabase } from "./supabase";

interface TrackContext {
  title: string;
  artist: string;
  producer?: string;
  genre?: string[];
  sampledMusic?: string;
}

interface HostSegment {
  speaker: "HOST_A" | "HOST_B";
  text: string;
}

interface AIHost {
  name: string;
  personality: string;
  voice_id: string;
  catchphrases: string[];
}

let hostsCache: AIHost[] | null = null;

async function getHosts(): Promise<AIHost[]> {
  if (hostsCache) return hostsCache;

  const { data } = await supabase
    .from("ai_hosts")
    .select("name, personality, voice_id, catchphrases")
    .eq("is_active", true)
    .limit(2);

  hostsCache = (data as AIHost[]) || [];
  return hostsCache;
}

/**
 * Generate a dual-host conversation script between tracks
 */
export async function generateDualHostScript(
  outgoing: TrackContext,
  incoming: TrackContext,
  isAdIntro?: boolean,
  adTitle?: string
): Promise<HostSegment[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set — AI host scripts disabled");
    return [];
  }

  const hosts = await getHosts();
  if (hosts.length < 2) {
    console.warn("Need 2 AI hosts — only found", hosts.length);
    return [];
  }

  const [hostA, hostB] = hosts;

  const prompt = isAdIntro
    ? `You are writing a short radio conversation between two AI radio hosts.
${hostA.name} (HOST_A): ${hostA.personality}
${hostB.name} (HOST_B): ${hostB.personality}

They are about to introduce a short ad break on the station. The ad is for: "${adTitle}"
After the ad, the next song will be "${incoming.title}" by ${incoming.artist}.

Write a natural, short 2-3 line conversation (alternating HOST_A and HOST_B) that smoothly transitions to the ad break.
Format each line as: HOST_A: <text> or HOST_B: <text>
Keep it casual and warm. No hashtags, no emojis.`
    : `You are writing a short radio conversation between two AI radio hosts.
${hostA.name} (HOST_A): ${hostA.personality}
${hostB.name} (HOST_B): ${hostB.personality}

They just finished playing: "${outgoing.title}" by ${outgoing.artist}${outgoing.producer ? ` (produced by ${outgoing.producer})` : ""}${outgoing.sampledMusic ? ` — samples "${outgoing.sampledMusic}"` : ""}
Next up: "${incoming.title}" by ${incoming.artist}${incoming.genre?.length ? ` [${incoming.genre.join(", ")}]` : ""}

Write a natural, short 3-4 line conversation (alternating HOST_A and HOST_B) transitioning between tracks. They should reference specific details about the music — production, samples, history, vibes.
Format each line as: HOST_A: <text> or HOST_B: <text>
Keep it casual and warm. No hashtags, no emojis.`;

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
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const data = await response.json();
    const text = data.content?.[0]?.text ?? "";

    return parseHostSegments(text);
  } catch (err) {
    console.error("AI host script generation failed:", err);
    return [];
  }
}

function parseHostSegments(text: string): HostSegment[] {
  const segments: HostSegment[] = [];
  const lines = text.split("\n").filter((l) => l.trim());

  for (const line of lines) {
    const matchA = line.match(/^HOST_A:\s*(.+)/i);
    const matchB = line.match(/^HOST_B:\s*(.+)/i);

    if (matchA) {
      segments.push({ speaker: "HOST_A", text: matchA[1].trim() });
    } else if (matchB) {
      segments.push({ speaker: "HOST_B", text: matchB[1].trim() });
    }
  }

  return segments;
}

/**
 * Convert host segments to audio using ElevenLabs TTS
 */
export async function segmentsToAudio(segments: HostSegment[]): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceA = process.env.ELEVENLABS_VOICE_ID_HOST_A;
  const voiceB = process.env.ELEVENLABS_VOICE_ID_HOST_B;

  if (!apiKey || !voiceA || !voiceB) {
    console.warn("ElevenLabs not fully configured — TTS disabled");
    return null;
  }

  // Skip placeholder voice IDs
  if (voiceA.startsWith("PLACEHOLDER") || voiceB.startsWith("PLACEHOLDER")) {
    console.log("Using placeholder voice IDs — skipping TTS");
    return null;
  }

  const audioBuffers: Buffer[] = [];

  for (const segment of segments) {
    const voiceId = segment.speaker === "HOST_A" ? voiceA : voiceB;

    try {
      const response = await fetch(
        `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
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
      }
    } catch (err) {
      console.error(`TTS failed for ${segment.speaker}:`, err);
    }
  }

  if (audioBuffers.length === 0) return null;

  // Concatenate audio buffers (simple concat — works for same format)
  return Buffer.concat(audioBuffers);
}

/**
 * Full pipeline: generate script → TTS → save to storage
 */
export async function generateHostSegment(
  slug: string,
  outgoing: TrackContext,
  incoming: TrackContext
): Promise<string | null> {
  const segments = await generateDualHostScript(outgoing, incoming);
  if (segments.length === 0) {
    // Log the script even if TTS is disabled
    console.log(`🎙️ [${slug}] AI Hosts script:`);
    return null;
  }

  console.log(`🎙️ [${slug}] AI Hosts generated ${segments.length} lines`);
  for (const seg of segments) {
    console.log(`   ${seg.speaker}: ${seg.text}`);
  }

  const audio = await segmentsToAudio(segments);
  if (!audio) return null;

  // Save to dj-segments storage
  const filename = `${slug}/${Date.now()}_segment.mp3`;
  const { error } = await supabase.storage
    .from("dj-segments")
    .upload(filename, audio, { contentType: "audio/mpeg" });

  if (error) {
    console.error(`Failed to upload DJ segment:`, error.message);
    return null;
  }

  const { data: urlData } = supabase.storage.from("dj-segments").getPublicUrl(filename);
  return urlData.publicUrl;
}

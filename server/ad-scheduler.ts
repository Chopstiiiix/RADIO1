import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { supabase } from "./supabase";

const KIKA_VOICE_ID = "zGjIP4SZlMnY9m93k97r";
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";

interface ApprovedAd {
  id: string;
  advert: {
    id: string;
    title: string;
    description: string | null;
    file_url: string;
    duration_seconds: number | null;
  };
  frequency: string;
}

// Track last play time per advert per channel
const lastPlayed = new Map<string, number>(); // key: `${slug}:${advertId}`

/**
 * Get approved ads for a broadcaster channel
 */
export async function getApprovedAdsForChannel(broadcasterId: string): Promise<ApprovedAd[]> {
  const { data, error } = await supabase
    .from("ad_requests")
    .select(`
      id, frequency,
      advert:adverts(id, title, description, file_url, duration_seconds)
    `)
    .eq("broadcaster_id", broadcasterId)
    .eq("status", "approved");

  if (error || !data) return [];
  return data as unknown as ApprovedAd[];
}

/**
 * Determine if an ad should play based on its frequency setting
 */
export function shouldPlayAd(slug: string, ad: ApprovedAd): boolean {
  const key = `${slug}:${ad.advert.id}`;
  const last = lastPlayed.get(key);
  if (!last) return true;

  const elapsed = Date.now() - last;

  switch (ad.frequency) {
    case "every-track":
      return true;
    case "every-15min":
      return elapsed > 15 * 60 * 1000;
    case "every-30min":
      return elapsed > 30 * 60 * 1000;
    case "hourly":
    default:
      return elapsed > 60 * 60 * 1000;
  }
}

/**
 * Mark an ad as played
 */
export function markAdPlayed(slug: string, advertId: string) {
  lastPlayed.set(`${slug}:${advertId}`, Date.now());
}

/**
 * Get the next ad to play for a channel (if any are due)
 */
export async function getNextAdForChannel(
  broadcasterId: string,
  slug: string
): Promise<ApprovedAd | null> {
  const ads = await getApprovedAdsForChannel(broadcasterId);

  for (const ad of ads) {
    if (shouldPlayAd(slug, ad)) {
      return ad;
    }
  }

  return null;
}

/**
 * Generate Kika's TTS ad read for an advert.
 * Creates a natural-sounding ad spot using Claude for script + ElevenLabs for voice.
 * Returns the path to the generated audio file and its duration.
 */
export async function generateAdAudio(
  ad: ApprovedAd,
  outputDir: string,
): Promise<{ path: string; duration: number } | null> {
  if (!ELEVENLABS_API_KEY) {
    console.error("❌ ELEVENLABS_API_KEY not set — cannot generate ad audio");
    return null;
  }

  const adTitle = ad.advert.title;
  const adDescription = ad.advert.description || adTitle;

  // Generate a short, natural ad script using Claude
  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  let script = `This is ${adTitle}. ${adDescription}. Check it out.`;

  if (anthropicKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 200,
          messages: [{
            role: "user",
            content: `Write a short, smooth radio ad read (2-3 sentences max, under 15 seconds when spoken) for this product/brand. Make it sound natural and cool, like a radio host casually recommending something. No hashtags, no emojis, no "hey guys".

Product: ${adTitle}
Description: ${adDescription}

Just output the script, nothing else.`,
          }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.content?.[0]?.text?.trim();
        if (content) script = content;
      }
    } catch {
      // Use fallback script
    }
  }

  console.log(`📢 [Kika] Ad script for "${adTitle}": ${script}`);

  // Generate TTS with Kika's voice
  try {
    const ttsRes = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${KIKA_VOICE_ID}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": ELEVENLABS_API_KEY,
        },
        body: JSON.stringify({
          text: script,
          model_id: "eleven_turbo_v2_5",
          voice_settings: {
            stability: 0.55,
            similarity_boost: 0.8,
          },
        }),
      }
    );

    if (!ttsRes.ok) {
      console.error(`❌ [Kika] TTS failed: ${ttsRes.status}`);
      return null;
    }

    const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
    fs.mkdirSync(outputDir, { recursive: true });

    const rawPath = path.join(outputDir, `AD__Kika__${Date.now()}_${adTitle.replace(/[^a-zA-Z0-9]/g, "_")}.mp3`);
    fs.writeFileSync(rawPath, audioBuffer);

    // Get duration via ffprobe
    let duration = 15;
    try {
      const probe = execSync(`ffprobe -v quiet -print_format json -show_format "${rawPath}"`, { encoding: "utf-8" });
      const info = JSON.parse(probe);
      duration = parseFloat(info.format?.duration || "15");
    } catch {
      // fallback
    }

    console.log(`📢 [Kika] Ad audio generated: ${rawPath} (${Math.round(duration)}s)`);
    return { path: rawPath, duration };
  } catch (err) {
    console.error("❌ [Kika] Ad generation error:", err);
    return null;
  }
}

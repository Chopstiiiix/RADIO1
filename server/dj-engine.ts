// AI DJ Engine — generates voice segments between tracks
// Requires: ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID, ANTHROPIC_API_KEY

interface DJContext {
  currentTrack: { title: string; artist: string };
  nextTrack: { title: string; artist: string };
  timeOfDay: string;
  listenerCount?: number;
}

export async function generateDJScript(context: DJContext): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("ANTHROPIC_API_KEY not set — DJ scripts disabled");
    return "";
  }

  const prompt = `You are an AI radio DJ for Caster, a 24/7 internet radio station.
Generate a short, natural DJ segment (2-3 sentences max) to transition between songs.

Current track: "${context.currentTrack.title}" by ${context.currentTrack.artist}
Next track: "${context.nextTrack.title}" by ${context.nextTrack.artist}
Time: ${context.timeOfDay}

Keep it casual, warm, and conversational. No hashtags. No emojis.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 150,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  const data = await response.json();
  return data.content?.[0]?.text ?? "";
}

export async function textToSpeech(text: string): Promise<Buffer | null> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!apiKey || !voiceId) {
    console.warn("ElevenLabs not configured — TTS disabled");
    return null;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_turbo_v2_5",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    console.error("ElevenLabs error:", response.statusText);
    return null;
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createClient } from "@supabase/supabase-js";

const BROADCAST_API = process.env.BROADCAST_API_URL || "http://localhost:5001";

// Lazy-init service role client (avoids crash if env vars missing at build time)
let _serviceSupabase: ReturnType<typeof createClient> | null = null;
function getServiceSupabase() {
  if (!_serviceSupabase) {
    _serviceSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }
  return _serviceSupabase;
}

async function getAuthenticatedBroadcaster(req: NextRequest) {
  // Try server-side cookie auth first
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (user && !error) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      if (profile?.role === "broadcaster") {
        const { data: channel } = await supabase
          .from("broadcaster_profiles")
          .select("channel_slug, is_live")
          .eq("id", user.id)
          .single();
        if (channel?.channel_slug) {
          return { userId: user.id, channel };
        }
      }
    }
  } catch {
    // Cookie auth failed — fall through to body-based auth
  }

  // Fallback: use broadcaster_id from request body + service role to verify
  try {
    const body = await req.clone().json();
    const { broadcaster_id } = body;
    if (!broadcaster_id) return null;

    const supa = getServiceSupabase();
    const { data: profile } = await supa
      .from("profiles")
      .select("role")
      .eq("id", broadcaster_id)
      .single();
    if ((profile as any)?.role !== "broadcaster") return null;

    const { data: channel } = await supa
      .from("broadcaster_profiles")
      .select("channel_slug, is_live")
      .eq("id", broadcaster_id)
      .single();
    const ch = channel as any;
    if (!ch?.channel_slug) return null;

    return { userId: broadcaster_id, channel: ch as { channel_slug: string; is_live: boolean } };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const auth = await getAuthenticatedBroadcaster(req);

  if (!auth) {
    return NextResponse.json({ error: "Unauthorized or not a broadcaster" }, { status: 401 });
  }

  const { userId, channel } = auth;
  const body = await req.json();
  const { action, filename, track_ids, use_ai_host, mode, broadcast_queue } = body;

  if (action === "voice_only") {
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/voice-only`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcaster_id: userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error || "Failed to start voice broadcast" }, { status: res.status });
      }

      return NextResponse.json({ ok: true, message: data.message, slug: channel.channel_slug });
    } catch {
      return NextResponse.json({ error: "Broadcast server unavailable" }, { status: 503 });
    }
  }

  if (action === "start") {
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcaster_id: userId, track_ids, broadcast_queue, use_ai_host: use_ai_host ?? false, mode: mode || "tracks" }),
      });

      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error || "Failed to start broadcast" }, { status: res.status });
      }

      return NextResponse.json({ ok: true, message: data.message, slug: channel.channel_slug });
    } catch {
      return NextResponse.json(
        { error: "Broadcast server unavailable — ensure the server is running" },
        { status: 503 }
      );
    }
  }

  if (action === "stop") {
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/stop`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();
      return NextResponse.json({ ok: true, message: data.message });
    } catch {
      return NextResponse.json(
        { error: "Broadcast server unavailable" },
        { status: 503 }
      );
    }
  }

  if (action === "skip") {
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/skip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: data.message });
    } catch {
      return NextResponse.json({ error: "Broadcast server unavailable" }, { status: 503 });
    }
  }

  if (action === "cue") {
    if (!filename) {
      return NextResponse.json({ error: "filename required" }, { status: 400 });
    }
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/cue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: data.message });
    } catch {
      return NextResponse.json({ error: "Broadcast server unavailable" }, { status: 503 });
    }
  }

  if (action === "add_tracks") {
    if (!track_ids?.length) {
      return NextResponse.json({ error: "track_ids required" }, { status: 400 });
    }
    if (!channel.is_live) {
      return NextResponse.json({ error: "Channel is not live — start a broadcast first" }, { status: 400 });
    }
    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/add-tracks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcaster_id: userId, track_ids }),
      });
      const data = await res.json();
      if (!res.ok) {
        return NextResponse.json({ error: data.error }, { status: res.status });
      }
      return NextResponse.json({ ok: true, message: data.message, slug: channel.channel_slug });
    } catch {
      return NextResponse.json({ error: "Broadcast server unavailable" }, { status: 503 });
    }
  }

  return NextResponse.json({ error: "Invalid action — use 'start', 'stop', 'skip', 'cue', or 'add_tracks'" }, { status: 400 });
}

import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const BROADCAST_API = process.env.BROADCAST_API_URL || "http://localhost:5000";

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify broadcaster role
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "broadcaster") {
    return NextResponse.json({ error: "Not a broadcaster" }, { status: 403 });
  }

  // Get channel slug
  const { data: channel } = await supabase
    .from("broadcaster_profiles")
    .select("channel_slug, is_live")
    .eq("id", user.id)
    .single();

  if (!channel?.channel_slug) {
    return NextResponse.json({ error: "No channel configured" }, { status: 400 });
  }

  const body = await req.json();
  const { action, filename, track_ids, use_ai_host } = body;

  if (action === "start") {
    if (channel.is_live) {
      return NextResponse.json({ ok: true, message: "Already broadcasting" });
    }

    try {
      const res = await fetch(`${BROADCAST_API}/api/channels/${channel.channel_slug}/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ broadcaster_id: user.id, track_ids, use_ai_host: use_ai_host ?? false }),
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

  return NextResponse.json({ error: "Invalid action — use 'start', 'stop', 'skip', or 'cue'" }, { status: 400 });
}

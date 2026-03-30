import { NextRequest, NextResponse } from "next/server";

const BROADCAST_API = process.env.BROADCAST_API_URL || "http://localhost:5000";

/**
 * POST /api/mic — Receives mic audio chunks and forwards to backend
 */
export async function POST(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    const body = await req.arrayBuffer();
    const res = await fetch(`${BROADCAST_API}/api/mic/${slug}`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(body),
    });

    if (res.ok) {
      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: "Failed to send audio" }, { status: res.status });
    }
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}

/**
 * DELETE /api/mic — Stop mic session
 */
export async function DELETE(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug");
  if (!slug) {
    return NextResponse.json({ error: "slug required" }, { status: 400 });
  }

  try {
    await fetch(`${BROADCAST_API}/api/mic/${slug}/stop`, { method: "POST" });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Backend unavailable" }, { status: 503 });
  }
}

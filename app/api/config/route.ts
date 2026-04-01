import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const backendPort = process.env.BACKEND_PORT || "5001";
  const protocol = req.nextUrl.protocol || "http:";
  const hostname = req.nextUrl.hostname || "localhost";
  const backendUrl =
    process.env.BROADCAST_API_URL ||
    `${protocol}//${hostname}:${backendPort}`;

  return NextResponse.json({
    backendUrl,
    streamUrl: process.env.NEXT_PUBLIC_STREAM_URL || "",
    livekitUrl: process.env.LIVEKIT_WS_URL || "",
  });
}

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    streamUrl: process.env.BROADCAST_API_URL || process.env.NEXT_PUBLIC_STREAM_URL || "",
  });
}

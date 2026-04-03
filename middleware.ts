import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|video/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|m4v|mp4|webm)$).*)",
  ],
};

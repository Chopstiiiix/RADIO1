import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // Skip auth logic for API routes, stream, and metadata endpoints
  if (pathname.startsWith("/api/") || pathname.startsWith("/stream/") || pathname.startsWith("/metadata/")) {
    return supabaseResponse;
  }

  // Public routes
  const isPublicRoute = pathname === "/login" || pathname === "/signup" || pathname.startsWith("/callback");

  // Not logged in + trying to access protected route → login with redirect
  if (!user && !isPublicRoute && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirectTo", pathname);
    return NextResponse.redirect(url);
  }

  // Logged in + on auth pages → redirect to dashboard
  // Only redirect if we can confirm the profile exists to avoid loops
  if (user && isPublicRoute) {
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        const url = request.nextUrl.clone();
        if (profile.role === "broadcaster") url.pathname = "/broadcast";
        else if (profile.role === "advertiser") url.pathname = "/advertise";
        else url.pathname = "/listen";
        return NextResponse.redirect(url);
      }
    } catch {
      // Profile not ready yet — let them stay on the page
    }
  }

  return supabaseResponse;
}

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NotificationButton from "@/app/components/NotificationButton";
import AvatarMenu from "@/app/components/AvatarMenu";
import NavCarousel from "@/app/components/NavCarousel";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, display_name, avatar_url")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const profileHref =
    profile.role === "broadcaster" ? "/broadcast/profile" :
    profile.role === "advertiser" ? "/advertise/profile" :
    "/profile";

  return (
    <div id="app-root" style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "var(--bg-base)",
      fontFamily: "'JetBrains Mono', monospace",
      overflow: "hidden",
    }}>
      {/* Top nav */}
      <nav style={{
        width: "100%",
        padding: "16px 20px",
        borderBottom: "2px solid #27272a",
        backgroundColor: "var(--bg-base)",
        flexShrink: 0,
      }}>
        {/* Top row: brand + user */}
        <div style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "12px",
        }}>
          <a href={profile.role === "broadcaster" ? "/broadcast" : profile.role === "advertiser" ? "/advertise" : "/listen"}
            style={{
              fontSize: "18px", fontWeight: 800, letterSpacing: "-0.05em",
              color: "#f59e0b", textDecoration: "none", textTransform: "uppercase",
            }}>
            Caster<span style={{ color: "#ffffff" }}>_</span>
          </a>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{
              fontSize: "10px",
              color: "#f59e0b",
              textTransform: "uppercase",
              padding: "2px 6px",
              backgroundColor: "rgba(245, 158, 11, 0.1)",
              border: "1px solid rgba(245, 158, 11, 0.2)",
              borderRadius: "2px",
              fontWeight: 700,
              letterSpacing: "0.1em",
            }}>
              {profile.role}
            </span>
            {profile.role !== "listener" && <NotificationButton role={profile.role} />}
            <AvatarMenu
              avatarUrl={profile.avatar_url || null}
              displayName={profile.display_name}
              role={profile.role}
              profileHref={profileHref}
            />
          </div>
        </div>

        {/* Nav links carousel */}
        {profile.role === "listener" && (
          <NavCarousel items={[
            { href: "/listen", label: "Channels" },
            { href: "/search", label: "Search" },
          ]} />
        )}

        {profile.role === "broadcaster" && (
          <NavCarousel items={[
            { href: "/broadcast", label: "Dashboard" },
            { href: "/broadcast/tracks", label: "Tracks" },
            { href: "/broadcast/ads", label: "Ads" },
            { href: "/broadcast/agents", label: "Hosts" },
            { href: "/listen", label: "Listen" },
            { href: "/search", label: "Search" },
            { href: "/broadcast/go-live", label: "Live" },
          ]} />
        )}

        {profile.role === "advertiser" && (
          <NavCarousel items={[
            { href: "/advertise", label: "Dashboard" },
            { href: "/advertise/channels", label: "Channels" },
            { href: "/advertise/adverts", label: "My Ads" },
            { href: "/advertise/requests", label: "Requests" },
            { href: "/listen", label: "Listen" },
            { href: "/search", label: "Search" },
          ]} />
        )}
      </nav>

      <main style={{ padding: "24px 20px", width: "100%", overflowX: "hidden", overflowY: "auto", flex: 1, position: "relative", WebkitOverflowScrolling: "touch" }}>
        {children}
      </main>
    </div>
  );
}


import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import NotificationButton from "@/app/components/NotificationButton";
import AvatarMenu from "@/app/components/AvatarMenu";
import NavLink from "@/app/components/NavLink";

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
    <div style={{
      height: "100dvh",
      display: "flex",
      flexDirection: "column",
      backgroundColor: "var(--bg-base)",
      fontFamily: "'JetBrains Mono', monospace",
      overflow: "hidden",
    }}>
      {/* Top nav */}
      <nav style={{
        maxWidth: "min(460px, 100vw)",
        margin: "0 auto",
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

        {/* Nav links row */}
        <div style={{
          display: "flex",
          gap: "6px",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
        }}>
          {profile.role === "listener" && (
            <>
              <NavLink href="/listen">Channels</NavLink>
              <NavLink href="/search">Search</NavLink>
            </>
          )}

          {profile.role === "broadcaster" && (
            <>
              <NavLink href="/broadcast">Dashboard</NavLink>
              <NavLink href="/broadcast/tracks">Tracks</NavLink>
              <NavLink href="/broadcast/ads">Ads</NavLink>
              <NavLink href="/broadcast/agents">Hosts</NavLink>
              <NavLink href="/listen">Listen</NavLink>
              <NavLink href="/search">Search</NavLink>
              <NavLink href="/broadcast/go-live">Live</NavLink>
            </>
          )}

          {profile.role === "advertiser" && (
            <>
              <NavLink href="/advertise">Dashboard</NavLink>
              <NavLink href="/advertise/channels">Channels</NavLink>
              <NavLink href="/advertise/adverts">My Ads</NavLink>
              <NavLink href="/advertise/requests">Requests</NavLink>
              <NavLink href="/listen">Listen</NavLink>
              <NavLink href="/search">Search</NavLink>
            </>
          )}
        </div>
      </nav>

      <main style={{ padding: "24px 20px", maxWidth: "min(460px, 100vw)", margin: "0 auto", overflowX: "hidden", overflow: "hidden", flex: 1, position: "relative" }}>
        {children}
      </main>
    </div>
  );
}


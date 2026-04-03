import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function Home() {
  let user = null;
  try {
    const supabase = await createServerSupabaseClient();
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect("/intro");
  }

  if (!user) {
    redirect("/intro");
  }

  try {
    const supabase = await createServerSupabaseClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role === "broadcaster") redirect("/broadcast");
    if (profile?.role === "advertiser") redirect("/advertise");
  } catch {
    // fall through
  }

  redirect("/listen");
}

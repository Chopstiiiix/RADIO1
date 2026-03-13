import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Use service role key if available (for server operations), fall back to anon
export const supabase = createClient(
  supabaseUrl,
  serviceRoleKey || anonKey,
  serviceRoleKey
    ? { auth: { autoRefreshToken: false, persistSession: false } }
    : undefined
);

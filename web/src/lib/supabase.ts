import { auth } from "@clerk/nextjs/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Per-request Supabase client acting as the signed-in user: the Clerk JWT
 * (template `supabase`, same as mobile) is injected as the Bearer token, so
 * the existing RLS policies (user_id = auth.jwt()->>'sub') apply unchanged.
 * No service keys anywhere in this app — same trust boundary as mobile.
 */
export async function supabaseForUser(): Promise<{
  supabase: SupabaseClient;
  userId: string;
}> {
  const { userId, getToken } = await auth();
  if (!userId) throw new Error("Not signed in");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Supabase env vars are missing");
  const token = await getToken({ template: "supabase" });
  const supabase = createClient(url, anon, {
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
  });
  return { supabase, userId };
}

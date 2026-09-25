import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cron purge for grace-period account deletions. Triggered by GitHub Actions
 * (free) — never by users. Guarded by CRON_SECRET, runs fully on service role.
 */
export const dynamic = "force-dynamic";

const USER_TABLES = [
  "set_entries",
  "workout_logs",
  "user_template_exercises",
  "user_templates",
  "user_program_workouts",
  "user_active_program",
  "user_programs",
  "user_exercises",
  "bodyweight_entries",
  "body_measurements",
  "workout_photos",
  "user_preferences",
  "coach_narration_cache",
  "coach_narrate_rate",
  "profiles",
];

interface StorageEntry {
  name: string;
  id?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Recursive delete: photo blobs live at <userId>/<logUuid>/<photoUuid>.jpg,
 * so a flat listing only sees log folders. Depth-capped, paginated to empty.
 */
async function removePrefix(admin: SupabaseClient, prefix: string, depth = 0): Promise<void> {
  if (depth > 3) return;
  for (let i = 0; i < 100; i++) {
    const { data, error } = await admin.storage.from("workout-photos").list(prefix, { limit: 100 });
    if (error) throw new Error(`storage list failed: ${error.message}`);
    if (!data || data.length === 0) return;
    const files: string[] = [];
    const dirs: string[] = [];
    for (const e of data as StorageEntry[]) {
      if (e.id != null || e.metadata != null) files.push(`${prefix}${e.name}`);
      else dirs.push(`${prefix}${e.name}/`);
    }
    if (files.length > 0) {
      const { error: delError } = await admin.storage.from("workout-photos").remove(files);
      if (delError) throw new Error(`storage remove failed: ${delError.message}`);
    }
    for (const dir of dirs) await removePrefix(admin, dir, depth + 1);
    if (data.length < 100 && dirs.length === 0) return;
    if (data.length < 100) {
      // Re-list: files are gone but verify dirs drained on next pass.
      continue;
    }
  }
  throw new Error("storage delete did not converge");
}

async function wipeStorage(admin: SupabaseClient, userId: string): Promise<void> {
  await removePrefix(admin, `${userId}/`);
}

export async function POST(req: Request) {
  // Ships dark with the rest of the flow: no purge runs until the feature is
  // enabled, even if the cron fires.
  if (process.env.ACCOUNT_DELETION_ENABLED !== "true") {
    return Response.json({ ok: false, error: "disabled" }, { status: 503 });
  }
  const secret = process.env.CRON_SECRET;
  if (!secret) return Response.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const clerkSecret = process.env.CLERK_SECRET_KEY;
  if (!url || !serviceKey || !clerkSecret) {
    return Response.json({ ok: false, error: "server_misconfigured" }, { status: 500 });
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: due, error } = await admin
    .from("account_deletions")
    .select("user_id")
    .lte("purge_at", new Date().toISOString());
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const results: { userId: string; ok: boolean; error?: string }[] = [];
  for (const row of (due ?? []) as { user_id: string }[]) {
    const userId = row.user_id;
    try {
      await wipeStorage(admin, userId);
      for (const table of USER_TABLES) {
        const { error: delError } = await admin.from(table).delete().eq("user_id", userId);
        if (delError) throw new Error(`${table}: ${delError.message}`);
      }
      const { error: flagError } = await admin.from("account_deletions").delete().eq("user_id", userId);
      if (flagError) throw new Error(`account_deletions: ${flagError.message}`);
      const clerkRes = await fetch(`https://api.clerk.com/v1/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${clerkSecret}` },
      });
      // 404 = already gone (user deleted via Clerk dashboard) — still success.
      if (!clerkRes.ok && clerkRes.status !== 404) throw new Error(`clerk: ${clerkRes.status}`);
      results.push({ userId, ok: true });
    } catch (e) {
      results.push({ userId, ok: false, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return Response.json({ ok: true, purged: results.filter((r) => r.ok).length, results });
}

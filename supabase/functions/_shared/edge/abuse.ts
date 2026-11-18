import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/**
 * Abuse layers shared by the AI endpoints (docs/decisions/ABUSE.md), on top
 * of each endpoint's per-user daily quota:
 *  - burst: a per-user per-minute cap, so a script can't spend a day's quota
 *    in seconds;
 *  - global: one daily ceiling across every account, the spend breaker when
 *    many new accounts appear at once (Sybil). Tunable via AI_GLOBAL_DAILY.
 * Both reuse ai_task_consume (atomic window counter). A failed counter read
 * fails closed (the caller returns 503/429), never open.
 */
/** One Ask turn is several chat steps (tool calls), so chat gets more room. */
const burstPerMinute = (task: string) => (task === 'chat' ? 24 : 10);
const GLOBAL_USER = '*global*';

export type AbuseVerdict = 'ok' | 'burst' | 'global' | 'unavailable';

export async function abuseCheck(db: SupabaseClient, userId: string, task: string): Promise<AbuseVerdict> {
  const burst = await db.rpc('ai_task_consume', {
    p_user: userId,
    p_task: `${task}:burst`,
    p_limit: burstPerMinute(task),
    p_window_seconds: 60,
  });
  if (burst.error) return 'unavailable';
  if (burst.data !== true) return 'burst';
  const cap = Number(Deno.env.get('AI_GLOBAL_DAILY') ?? '') || 5000;
  const global = await db.rpc('ai_task_consume', {
    p_user: GLOBAL_USER,
    p_task: 'upstream',
    p_limit: cap,
    p_window_seconds: 86_400,
  });
  if (global.error) return 'unavailable';
  if (global.data !== true) {
    console.error('ai global daily ceiling reached', cap);
    return 'global';
  }
  return 'ok';
}

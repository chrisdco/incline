import type { FeaturePackV1, NarrateSurface } from './feature-pack';
import type { CoachNarration } from './narrate-validate';
import type { CoachingInsightKind } from './types';
import type { ByokConfig } from '@/ai/byok';
import type { AiEvent, KvLike } from '@/ai/types';
import type { GetToken } from '@/sync/supabase-auth';

export type { CoachNarration } from './narrate-validate';
export type { NarrateSurface };

/** Pre-router cache prefix; still cleared on account switch for old installs. */
export const COACH_NARRATE_KV_PREFIX = 'coach.narrate.';
export const COACH_NARRATE_TIMEOUT_MS = 12_000;

export const SAFE_HOME_NARRATE_KINDS: ReadonlySet<CoachingInsightKind> = new Set([
  'volume_trend',
  'overload_ready',
  'recovery_gap',
  'muscle_balance',
]);

export function coachNarrateKvKey(
  userId: string,
  packHash: string,
  promptVersion: string,
  surface: string,
): string {
  return `${COACH_NARRATE_KV_PREFIX}${userId}.${packHash}.${promptVersion}.${surface}`;
}

export interface RequestCoachNarrationInput {
  surface: NarrateSurface;
  pack: FeaturePackV1;
  getToken: GetToken;
  userId: string | null | undefined;
}

export interface NarrateClientOverrides {
  aiExplanationsEnabled?: boolean;
  backendReady?: boolean;
  kv?: KvLike;
  fetchImpl?: typeof fetch;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  /** null = no BYOK; undefined = read the device setting. */
  byok?: ByokConfig | null;
  getByokKey?: () => Promise<string | null>;
  onEvent?: (event: AiEvent) => void;
}

async function readAiEnabled(override?: boolean): Promise<boolean> {
  if (typeof override === 'boolean') return override;
  const { useSettings } = await import('@/store/settings-store');
  return useSettings.getState().aiExplanationsEnabled === true;
}

async function readBackendReady(override?: boolean): Promise<boolean> {
  if (typeof override === 'boolean') return override;
  const { syncBackendReady } = await import('@/sync/supabase-auth');
  return syncBackendReady();
}

async function readKv(override?: KvLike): Promise<KvLike> {
  if (override) return override;
  const { kvStorage } = await import('@/db/kv');
  return kvStorage;
}

async function readByok(overrides?: NarrateClientOverrides) {
  if (overrides?.byok !== undefined) {
    return { byok: overrides.byok, getByokKey: overrides.getByokKey ?? (async () => null) };
  }
  const { useAiSettings, getByokKey } = await import('@/ai/byok');
  return { byok: useAiSettings.getState().byok, getByokKey };
}

/** Clerk token for the Supabase template, falling back to the default token. */
function supabaseToken(getToken: GetToken): () => Promise<string | null> {
  return async () => {
    try {
      const templated = await getToken({ template: 'supabase' });
      if (templated) return templated;
    } catch {
      // Template missing — try the default token.
    }
    try {
      return await getToken();
    } catch {
      return null;
    }
  };
}

/** Report fallbacks worth fixing (bad output, bugs) — not offline / quota / signed-out. */
async function reportEvent(event: AiEvent): Promise<void> {
  if (event.status === 'ok' || (event.reason !== 'invalid_output' && event.reason !== 'error')) return;
  // Metadata only (task, reason, providers) — never pack or wording.
  const { captureError } = await import('@/lib/error-sink');
  captureError(new Error(`ai.${event.taskId} fallback: ${event.reason}`), {
    where: `ai.${event.taskId}`,
    attempts: event.attempts.map((a) => `${a.providerId}:${a.outcome}`).join(','),
  });
}

/**
 * Optional AI wording for a FeaturePack via the AI router (BYOK first, then
 * the Incline gateway). Never throws — callers keep rule copy on null.
 */
export async function requestCoachNarration(
  input: RequestCoachNarrationInput,
  overrides?: NarrateClientOverrides,
): Promise<CoachNarration | null> {
  try {
    if (!input.userId) return null;
    if (!(await readAiEnabled(overrides?.aiExplanationsEnabled))) return null;

    const [{ runAiTask }, { buildProviderChain }, { narrateTask }] = await Promise.all([
      import('@/ai/router'),
      import('@/ai/chain'),
      import('@/ai/tasks/narrate'),
    ]);
    const { byok, getByokKey } = await readByok(overrides);

    let gateway: Parameters<typeof buildProviderChain>[0]['gateway'] = null;
    if (await readBackendReady(overrides?.backendReady)) {
      const env = overrides?.supabaseUrl && overrides.supabaseAnonKey ? null : await import('@/lib/env');
      gateway = {
        supabaseUrl: overrides?.supabaseUrl ?? env?.SUPABASE_URL ?? '',
        anonKey: overrides?.supabaseAnonKey ?? env?.SUPABASE_ANON_KEY ?? '',
        getToken: supabaseToken(input.getToken),
      };
    }

    const providers = buildProviderChain({ byok, getByokKey, gateway, fetchImpl: overrides?.fetchImpl });
    if (providers.length === 0) return null;

    const result = await runAiTask(
      narrateTask,
      { surface: input.surface, pack: input.pack, userId: input.userId },
      {
        providers,
        cache: await readKv(overrides?.kv),
        onEvent: overrides?.onEvent ?? ((e) => void reportEvent(e).catch(() => undefined)),
      },
    );
    return result.status === 'ok' ? result.output : null;
  } catch {
    return null;
  }
}

/** Wipe local narration cache (account switch). Settings flag is left as-is. */
export async function clearCoachNarrationCache(): Promise<void> {
  const [{ kvStorage }, { AI_CACHE_PREFIX }] = await Promise.all([import('@/db/kv'), import('@/ai/router')]);
  await kvStorage.removeKeysWithPrefix(COACH_NARRATE_KV_PREFIX);
  await kvStorage.removeKeysWithPrefix(`${AI_CACHE_PREFIX}narrate.`);
}

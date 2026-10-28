/**
 * Typed environment variable reader. All EXPO_PUBLIC_* vars are inlined
 * by Metro at build time — this module validates them at runtime so we
 * fail fast with a clear message instead of undefined-at-use-time bugs.
 */

function optionalEnv(value: string | undefined, fallback = ''): string {
  return value ?? fallback;
}

/* ---- Clerk (required) ---- */

/**
 * Dev-only Clerk bypass for UI iteration without signing in.
 *
 * Active ONLY when BOTH hold:
 * - running a dev bundle (`__DEV__` — false + dead-code-eliminated in release), and
 * - `EXPO_PUBLIC_DEV_BYPASS_AUTH=1` is set (inlined at build time).
 *
 * A production bundle can never activate this path, even if the var leaks in:
 * the `__DEV__` check returns false there. `typeof` guard keeps Node/vitest
 * imports (where `__DEV__` is undefined) safe.
 */
export function isDevAuthBypassEnabled(): boolean {
  const wantsBypass = process.env.EXPO_PUBLIC_DEV_BYPASS_AUTH === '1';
  if (!wantsBypass) return false;
  if (typeof __DEV__ !== 'undefined' && !__DEV__) {
    console.warn('[auth] EXPO_PUBLIC_DEV_BYPASS_AUTH is ignored in production builds.');
    return false;
  }
  return true;
}

export const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';

/**
 * Why the Clerk key can't be used, or null when it looks real. A real key is
 * `pk_(test|live)_` + base64 of the frontend API host followed by `$`.
 * Mirrors scripts/check-build-env.mjs, which blocks such builds on EAS.
 *
 * Checked here rather than thrown at import: ClerkProvider throws on a bad
 * key during render, which killed the first alpha at launch. The root
 * layout shows a config screen instead.
 */
export function clerkKeyProblem(key: string): string | null {
  if (!key) return 'missing';
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key);
  if (!m) return 'not a pk_test_/pk_live_ key';
  let decoded = '';
  try {
    decoded = globalThis.atob(m[2].replace(/=+$/, ''));
  } catch {
    return 'not base64';
  }
  if (!decoded.endsWith('$') || !decoded.includes('.')) return 'placeholder or truncated';
  return null;
}

export const CLERK_KEY_PROBLEM: string | null = isDevAuthBypassEnabled()
  ? null
  : clerkKeyProblem(CLERK_PUBLISHABLE_KEY);

/* ---- ExerciseDB (RapidAPI, optional — free tier needs neither) ---- */
export const EXERCISEDB_API_KEY = optionalEnv(process.env.EXPO_PUBLIC_EXERCISEDB_API_KEY);
export const EXERCISEDB_API_HOST = optionalEnv(process.env.EXPO_PUBLIC_EXERCISEDB_API_HOST);

/* ---- Supabase (optional — bundled fallback when unset) ---- */
export const SUPABASE_URL = optionalEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = optionalEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

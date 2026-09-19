/**
 * Typed environment variable reader. All EXPO_PUBLIC_* vars are inlined
 * by Metro at build time — this module validates them at runtime so we
 * fail fast with a clear message instead of undefined-at-use-time bugs.
 */

function requireEnv(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing required environment variable "${name}". ` +
        `Add it to .env.local (see .env.example for the list).`,
    );
  }
  return value;
}

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

export const CLERK_PUBLISHABLE_KEY = isDevAuthBypassEnabled()
  ? (process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '')
  : requireEnv(
      'EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY',
      process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    );

/* ---- ExerciseDB (RapidAPI, optional — free tier needs neither) ---- */
export const EXERCISEDB_API_KEY = optionalEnv(process.env.EXPO_PUBLIC_EXERCISEDB_API_KEY);
export const EXERCISEDB_API_HOST = optionalEnv(process.env.EXPO_PUBLIC_EXERCISEDB_API_HOST);

/* ---- Supabase (optional — bundled fallback when unset) ---- */
export const SUPABASE_URL = optionalEnv(process.env.EXPO_PUBLIC_SUPABASE_URL);
export const SUPABASE_ANON_KEY = optionalEnv(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

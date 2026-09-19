import { useAuth as useClerkAuth } from '@clerk/expo';

import { isDevAuthBypassEnabled } from '@/lib/env';

/**
 * App-wide auth hook. Prefer this over `useAuth` from `@clerk/expo` directly.
 *
 * Normal builds delegate to Clerk unchanged (zero behavior diff when the
 * bypass is off). With the dev bypass enabled
 * (`__DEV__` + `EXPO_PUBLIC_DEV_BYPASS_AUTH=1`), returns a local stub that
 * signs in as a fake `dev` user with no token — so screens can be iterated
 * without the Clerk sign-in flow and without a Clerk key.
 *
 * Bypass consequences (dev only):
 * - `getToken()` always resolves null → Supabase sync and AI narrations
 *   degrade to their existing unauthenticated null-paths (no-ops).
 * - The fake id claims the local DB owner via `bindLocalAccount('dev')`.
 *   Signing in later with a real account wipes dev data by design — treat
 *   bypass data as throwaway.
 */
export interface AppAuth {
  isLoaded: boolean;
  isSignedIn: boolean;
  userId: string | null;
  getToken: (options?: { template?: string }) => Promise<string | null>;
  signOut: () => Promise<void>;
}

function useClerkAppAuth(): AppAuth {
  const auth = useClerkAuth();
  return {
    isLoaded: auth.isLoaded,
    isSignedIn: auth.isSignedIn === true,
    userId: auth.userId ?? null,
    getToken: (options) => auth.getToken(options),
    signOut: () => auth.signOut(),
  };
}

const DEV_USER_ID = 'dev';

const devStubAuth: AppAuth = {
  isLoaded: true,
  isSignedIn: true,
  userId: DEV_USER_ID,
  getToken: async () => null,
  signOut: async () => {},
};

function useDevStubAuth(): AppAuth {
  return devStubAuth;
}

// Module-load selection (build-time constant): keeps hook order static per
// bundle, so no conditional-hook call and no rules-of-hooks exception.
export const useAppAuth: () => AppAuth = isDevAuthBypassEnabled()
  ? useDevStubAuth
  : useClerkAppAuth;

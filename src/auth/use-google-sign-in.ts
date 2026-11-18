import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useSSO } from '@clerk/expo';
import { useSignInWithGoogle } from '@clerk/expo/google';
import * as Linking from 'expo-linking';
import * as Updates from 'expo-updates';

import { reportError } from '@/lib/monitoring';

/**
 * Google sign-in for both auth screens.
 *
 * Android with a web client ID configured: the native account picker
 * (Credential Manager via @clerk/expo-google-signin), with no browser hop.
 * Everywhere else, or if the native path is unavailable (older build, no
 * Play services): Clerk's browser SSO, as before.
 *
 * Env: EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID (not a secret). iOS native
 * needs EXPO_PUBLIC_CLERK_GOOGLE_IOS_CLIENT_ID too; until then iOS uses
 * the browser flow.
 */
const NATIVE_ENABLED = Platform.OS === 'android' && !!process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID;

const TEST_CHANNELS: ReadonlySet<string> = new Set(['alpha', 'beta', 'preview', 'emulator']);

export type GoogleSignInResult = 'signed-in' | 'cancelled';

export function useGoogleSignIn(): () => Promise<GoogleSignInResult> {
  const { startSSOFlow } = useSSO();
  const { startGoogleAuthenticationFlow } = useSignInWithGoogle();

  const browser = useCallback(async (): Promise<GoogleSignInResult> => {
    const result = await startSSOFlow({ strategy: 'oauth_google', redirectUrl: Linking.createURL('/') });
    if (!result.createdSessionId) return 'cancelled';
    if (result.setActive) await result.setActive({ session: result.createdSessionId });
    return 'signed-in';
  }, [startSSOFlow]);

  return useCallback(async () => {
    if (!NATIVE_ENABLED) return browser();
    let native: Awaited<ReturnType<typeof startGoogleAuthenticationFlow>>;
    try {
      native = await startGoogleAuthenticationFlow();
    } catch (e) {
      // Native module missing (older build), no Google account, or a config
      // mismatch (DEVELOPER_ERROR: the Android OAuth client's SHA-1 doesn't
      // match the signing key). The browser still works, but report why so
      // a silent fallback can't hide a broken native path.
      const code = (e as { code?: unknown } | null)?.code;
      reportError(e, { area: 'google_sign_in', fallback: 'browser', code: typeof code === 'string' || typeof code === 'number' ? code : 'none' });
      // Test builds say why instead of silently switching to the browser
      // (the fallback hid this failure for a week). Play builds stay quiet.
      if (Updates.channel && TEST_CHANNELS.has(Updates.channel)) {
        const msg = e instanceof Error ? e.message : String(e);
        const useBrowser = await new Promise<boolean>((resolve) =>
          Alert.alert('Google sign-in (in-app) failed', `${String(code ?? 'no code')}: ${msg}`.slice(0, 400), [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Use browser', onPress: () => resolve(true) },
          ], { cancelable: true, onDismiss: () => resolve(false) }),
        );
        if (!useBrowser) return 'cancelled';
      }
      return browser();
    }
    if (!native.createdSessionId) return 'cancelled';
    if (native.setActive) await native.setActive({ session: native.createdSessionId });
    return 'signed-in';
  }, [browser, startGoogleAuthenticationFlow]);
}

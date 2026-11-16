import { useCallback } from 'react';
import { Platform } from 'react-native';
import { useSSO } from '@clerk/expo';
import { useSignInWithGoogle } from '@clerk/expo/google';
import * as Linking from 'expo-linking';

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
    } catch {
      // Native module missing or no usable Google account setup: the browser still works.
      return browser();
    }
    if (!native.createdSessionId) return 'cancelled';
    if (native.setActive) await native.setActive({ session: native.createdSessionId });
    return 'signed-in';
  }, [browser, startGoogleAuthenticationFlow]);
}

import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * app.json stays the static config; this file adds what depends on env.
 *
 * - Clerk's Google sign-in reads its client ID from `extra` (node_modules
 *   never get EXPO_PUBLIC_ inlining), so it is set here at build time instead
 *   of patched into Constants at runtime (#393).
 * - The value is identical in every EAS environment that sets it, so the
 *   fingerprint job and the build agree.
 *
 * Which CPU architectures an APK carries is NOT set here: it differs per build
 * profile, and anything in app config feeds the fingerprint, which the
 * deploy workflow computes without a profile. eas.json sets
 * ORG_GRADLE_PROJECT_reactNativeArchitectures per profile instead.
 */
export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...config.extra,
    EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID: process.env.EXPO_PUBLIC_CLERK_GOOGLE_WEB_CLIENT_ID,
  },
});

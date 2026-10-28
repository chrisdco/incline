#!/usr/bin/env node
/**
 * Fail a build in seconds, not after a 12-minute Gradle run, when the
 * public config it would inline is missing or a placeholder.
 *
 * Runs on EAS as the `eas-build-pre-install` hook (env vars from the build's
 * EAS environment are set there) and locally via `pnpm run check:build-env`.
 * Skips when EAS_BUILD_PROFILE=development (dev builds may use the auth bypass).
 *
 * The first alpha shipped `pk_test_...` from .env.example and crashed on
 * launch inside ClerkProvider. Keep this list in sync with src/lib/env.ts.
 */
import { readFileSync, existsSync } from 'node:fs';

function loadDotenv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// Locally, mirror Expo's env loading; on EAS the variables are already set.
if (!process.env.EAS_BUILD) {
  loadDotenv('.env.local');
  loadDotenv('.env');
}

export function clerkKeyProblem(key) {
  if (!key) return 'missing';
  const m = /^pk_(test|live)_([A-Za-z0-9+/=_-]+)$/.exec(key);
  if (!m) return 'not a pk_test_/pk_live_ key';
  let decoded = '';
  try {
    decoded = Buffer.from(m[2], 'base64').toString('utf8');
  } catch {
    return 'not base64';
  }
  // A real key encodes the Clerk frontend API host followed by "$".
  if (!decoded.endsWith('$') || !decoded.includes('.')) return 'placeholder or truncated';
  return null;
}

const checks = [
  ['EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY', clerkKeyProblem],
  ['EXPO_PUBLIC_SUPABASE_URL', (v) => (!v ? 'missing' : /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(v) && !v.includes('your-project') ? null : 'not a https://<ref>.supabase.co URL')],
  ['EXPO_PUBLIC_SUPABASE_ANON_KEY', (v) => (!v ? 'missing' : v.length > 40 && !v.startsWith('your_') ? null : 'placeholder')],
];

const isMain = import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('check-build-env.mjs');
if (isMain) {
  if (process.env.EAS_BUILD_PROFILE === 'development') {
    console.log('[check-build-env] development profile: skipped');
    process.exit(0);
  }
  if (process.env.EXPO_PUBLIC_DEV_BYPASS_AUTH === '1') {
    console.warn('[check-build-env] EXPO_PUBLIC_DEV_BYPASS_AUTH=1 is set; release bundles ignore it.');
  }
  const failures = checks
    .map(([name, check]) => [name, check(process.env[name])])
    .filter(([, problem]) => problem);
  if (failures.length > 0) {
    for (const [name, problem] of failures) console.error(`[check-build-env] ${name}: ${problem}`);
    console.error('[check-build-env] Set real values in the EAS environment (eas env:create) or .env.local.');
    process.exit(1);
  }
  console.log('[check-build-env] ok');
}

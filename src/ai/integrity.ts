import { INTEGRITY_NONCE_HEADER, INTEGRITY_TOKEN_HEADER } from '@/contracts/ai/integrity';

/**
 * Play Integrity headers for managed-AI requests (FOUNDATION-REVIEW G2;
 * policy in contracts/ai/integrity.ts, verification in
 * supabase/functions/_shared/edge/integrity.ts).
 *
 * Best effort by design: any failure (no Play services, module absent in an
 * older build, slow network, iOS) returns no headers and the request goes
 * ahead; the server only lowers the quota for unattested calls.
 *
 * Needs EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT (the Google Cloud project number).
 * iOS App Attest is a later step (key + server challenge flow).
 */

type IntegrityModule = {
  prepareIntegrityTokenProviderAsync(project: string): Promise<void>;
  requestIntegrityCheckAsync(requestHash: string): Promise<string>;
};

const PROJECT = process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT?.trim() ?? '';
const TIMEOUT_MS = 2500;

let mod: IntegrityModule | null | undefined;
let prepared: Promise<boolean> | null = null;

function load(): IntegrityModule | null {
  if (mod !== undefined) return mod;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: native module, Android only
    const { Platform } = require('react-native') as typeof import('react-native');
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: the native module may be absent
    mod = Platform.OS === 'android' ? (require('@expo/app-integrity') as IntegrityModule) : null;
  } catch {
    mod = null;
  }
  return mod;
}

function prepare(m: IntegrityModule): Promise<boolean> {
  prepared ??= m.prepareIntegrityTokenProviderAsync(PROJECT).then(
    () => true,
    () => {
      prepared = null;
      return false;
    },
  );
  return prepared;
}

function within<T>(p: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([p, new Promise<T>((resolve) => setTimeout(() => resolve(fallback), TIMEOUT_MS))]);
}

function nonce(): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy: keeps this file importable in node tests
  const Crypto = require('expo-crypto') as typeof import('expo-crypto');
  return Crypto.randomUUID();
}

async function token(m: IntegrityModule, requestHash: string): Promise<string | null> {
  try {
    return await m.requestIntegrityCheckAsync(requestHash);
  } catch (err) {
    // Providers expire; prepare once more and retry (ERR_APP_INTEGRITY_PROVIDER_INVALID).
    if ((err as { code?: string }).code !== 'ERR_APP_INTEGRITY_PROVIDER_INVALID') return null;
    prepared = null;
    if (!(await prepare(m))) return null;
    return m.requestIntegrityCheckAsync(requestHash).catch(() => null);
  }
}

export async function integrityHeaders(): Promise<Record<string, string>> {
  if (!PROJECT) return {};
  const m = load();
  if (!m) return {};
  try {
    if (!(await within(prepare(m), false))) return {};
    const n = nonce();
    const t = await within(token(m, n), null);
    return t ? { [INTEGRITY_TOKEN_HEADER]: t, [INTEGRITY_NONCE_HEADER]: n } : {};
  } catch {
    return {};
  }
}


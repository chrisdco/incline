/**
 * App attestation for the managed AI endpoints (FOUNDATION-REVIEW G2).
 *
 * The app attaches a Play Integrity token bound to a one-time nonce
 * (`requestHash`). The edge decodes it with Google and grades the request.
 * The grade only scales the daily quota: nothing is hard-blocked, so a
 * failed check costs a genuine user some headroom, never access.
 *
 *   verified    full quota
 *   unverified  quota × UNVERIFIED_QUOTA_FACTOR (no token, bad token,
 *               replayed nonce, modified app, emulator)
 *   off         full quota (checking not configured, or Google unreachable:
 *               our outage is never the user's problem)
 *
 * Testers (ai_user_tiers multiplier > 1) are the allow-list: never reduced.
 * BYOK traffic never reaches the edge, so none of this applies to it.
 */

export const INTEGRITY_TOKEN_HEADER = 'x-incline-integrity';
export const INTEGRITY_NONCE_HEADER = 'x-incline-integrity-nonce';

export const UNVERIFIED_QUOTA_FACTOR = 0.5;
/** A token older than this is treated as replayed. */
export const INTEGRITY_MAX_AGE_MS = 2 * 60 * 1000;

export type IntegrityGrade = 'verified' | 'unverified' | 'off';

/** The parts of Play Integrity's decoded `tokenPayloadExternal` we read. */
export interface IntegrityPayload {
  requestDetails?: { requestPackageName?: string; requestHash?: string; timestampMillis?: string | number };
  appIntegrity?: {
    appRecognitionVerdict?: string;
    packageName?: string;
    certificateSha256Digest?: string[];
  };
  deviceIntegrity?: { deviceRecognitionVerdict?: string[] };
}

export interface IntegrityExpectations {
  packageName: string;
  nonce: string;
  now: number;
  /**
   * Signing-cert digests (base64url SHA-256, as Play reports them) that count
   * as our build. Needed while the app is sideloaded: Play then says
   * UNRECOGNIZED_VERSION, and the cert is what proves the APK is ours.
   * Empty means only PLAY_RECOGNIZED passes.
   */
  certDigests: readonly string[];
}

/** Why a payload failed, for logs; null when it passes. */
export function integrityProblem(p: IntegrityPayload, e: IntegrityExpectations): string | null {
  const req = p.requestDetails;
  if (!req || req.requestPackageName !== e.packageName) return 'package';
  if (req.requestHash !== e.nonce) return 'nonce';
  const at = Number(req.timestampMillis);
  if (!Number.isFinite(at) || Math.abs(e.now - at) > INTEGRITY_MAX_AGE_MS) return 'stale';

  const app = p.appIntegrity;
  if (!app) return 'app';
  const recognised = app.appRecognitionVerdict === 'PLAY_RECOGNIZED';
  const ourCert =
    app.packageName === e.packageName &&
    (app.certificateSha256Digest ?? []).some((d) => e.certDigests.includes(d));
  if (!recognised && !ourCert) return 'app';

  const device = p.deviceIntegrity?.deviceRecognitionVerdict ?? [];
  if (!device.includes('MEETS_DEVICE_INTEGRITY')) return 'device';
  return null;
}

/** Daily limit after tier and attestation. Always at least 1. */
export function attestedLimit(base: number, multiplier: number, grade: IntegrityGrade): number {
  const factor = grade === 'unverified' && multiplier <= 1 ? UNVERIFIED_QUOTA_FACTOR : 1;
  return Math.max(1, Math.floor(base * multiplier * factor));
}

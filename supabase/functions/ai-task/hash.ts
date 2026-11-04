import { canonicalizeFeaturePack, type FeaturePackV1 } from '../_shared/contracts/narrate/feature-pack.ts';

/** SHA-256 hex of the canonical pack — same value the app computes with expo-crypto. */
export async function canonicalHash(pack: FeaturePackV1): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalizeFeaturePack(pack)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

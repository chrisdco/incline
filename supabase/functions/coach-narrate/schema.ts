/**
 * Edge host for the narrate contract. The contract itself is generated into
 * ../_shared/contracts from src/contracts (scripts/sync-contracts.mjs), so the
 * app, this function and evals run the same gates (#189). Only hashing is
 * host-specific: Deno has WebCrypto, the app uses expo-crypto.
 */
import { canonicalizeFeaturePack, type FeaturePackV1 } from '../_shared/contracts/narrate/feature-pack.ts';

export * from '../_shared/contracts/narrate/feature-pack.ts';
export * from '../_shared/contracts/narrate/narration.ts';

export async function hashFeaturePack(pack: FeaturePackV1): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalizeFeaturePack(pack)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

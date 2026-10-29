import { extractNumberTokens } from './narrate-validate';
import type { CoachingReason } from './reason';

/**
 * AI seam for "Why this weight?" copy. Typed hook only: no network here.
 *
 * Contract: a rewriter may rephrase `reason.sentence` but must never change,
 * add or drop a number. The weight, reps and inputs come from deterministic
 * rules (`suggestNextLoad` + `explainSuggestion`); the model only gets words.
 * {@link rewriteReason} enforces this with the same number-token gate the
 * narration path uses (see #153 for unsanitized input and #189 for the
 * client/edge gate drift): any rewrite whose numbers differ from the
 * deterministic sentence falls back to that sentence.
 */
export type ReasonRewriter = (reason: CoachingReason) => Promise<string>;

let rewriter: ReasonRewriter | null = null;

/** Install (or clear with null) a rewriter. Default is none = deterministic sentence. */
export function setReasonRewriter(next: ReasonRewriter | null): void {
  rewriter = next;
}

export function sameNumbers(a: string, b: string): boolean {
  const x = extractNumberTokens(a).sort();
  const y = extractNumberTokens(b).sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

export async function rewriteReason(reason: CoachingReason): Promise<string> {
  if (!rewriter) return reason.sentence;
  try {
    const text = (await rewriter(reason)).trim();
    if (!text || !sameNumbers(text, reason.sentence)) return reason.sentence;
    return text;
  } catch {
    return reason.sentence;
  }
}

/**
 * Third-party AI consent version (App Store 5.1.2(i); FOUNDATION-REVIEW G1).
 * Bump when the processors or what we send changes: every device asks again.
 * The client sends it as `x-incline-ai-consent` so the edge can audit/enforce.
 */
export const AI_CONSENT_VERSION = 1;
export const AI_CONSENT_HEADER = 'x-incline-ai-consent';

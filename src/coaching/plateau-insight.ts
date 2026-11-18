import { decisionSourceLabel, REMEDY_LABEL, type ProgressionAutonomy } from '@/contracts/coaching/progression';
import { planText } from '@/contracts/mcp/shape';
import type { ProgressionReview } from '@/db/queries/progression';

import { COACHING_RULE_VERSION, type CoachingInsight } from './types';

const href = (key: string) => `/progression/${encodeURIComponent(key)}`;

/**
 * Home's plateau card (PROGRESSION.md §7): a suggestion waiting from Ask,
 * Claude or the web first (someone asked for a decision), then the longest
 * open stall. Off = only waiting suggestions, which the user asked an AI for.
 */
export function plateauInsight(review: ProgressionReview | null, autonomy: ProgressionAutonomy): CoachingInsight | null {
  if (!review) return null;
  const waiting = review.inbox[0];
  if (waiting) {
    const more = review.inbox.length > 1 ? ` (+${review.inbox.length - 1} more)` : '';
    return {
      id: `plateau-proposal-${waiting.id}`,
      kind: 'plateau',
      severity: 'info',
      title: `Suggestion from ${decisionSourceLabel(waiting.source)}`,
      body: `${waiting.exerciseName}: ${planText(waiting.params, review.unit) ?? REMEDY_LABEL[waiting.remedy]}${more}`,
      href: href(waiting.exerciseKey),
      ruleVersion: COACHING_RULE_VERSION,
    };
  }
  if (autonomy === 'off') return null;
  const f = review.findings.find((x) => x.status === 'open');
  if (!f) return null;
  return {
    id: `plateau-${f.exerciseKey}`,
    kind: 'plateau',
    severity: 'info',
    title: `${f.name} has stalled`,
    body: `${f.sessions} sessions without progress. Suggested: ${REMEDY_LABEL[f.fix.plan.remedy].toLowerCase()}.`,
    href: href(f.exerciseKey),
    ruleVersion: COACHING_RULE_VERSION,
  };
}

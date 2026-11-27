import { WhatsNewSheetClassic } from './whats-new-sheet-classic';
import { WhatsNewSheetV2 } from './whats-new-sheet-v2';

/**
 * Which What's new sheet Home shows. Fallback after a bad phone check: set
 * 'classic' and merge; the deploy workflow ships it as an OTA. Both read
 * the same contract and seen ids, so switching never re-shows old cards.
 */
export const WHATS_NEW_STYLE: 'v2' | 'classic' = 'v2';

export function WhatsNewSheet() {
  return WHATS_NEW_STYLE === 'classic' ? <WhatsNewSheetClassic /> : <WhatsNewSheetV2 />;
}

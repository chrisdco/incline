import { requireOptionalNativeModule } from 'expo';

import type { WhatsNewItem } from '@/contracts/releases/whats-new';

/** True when this install lacks the native module the item first shipped with. */
export function needsNewerBuild(item: WhatsNewItem): boolean {
  return !!item.nativeModule && requireOptionalNativeModule(item.nativeModule) == null;
}

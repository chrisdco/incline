import { kvStorage } from '@/db/kv';

import { newUuid } from './uuid';

const KEY = 'device.id';
let cached: Promise<string> | null = null;

/**
 * Stable per-install id (not per user): tags AI activity with the device that
 * applied it, so a synced log can say where a change came from. Not a
 * tracking id — it never leaves the device except inside the user's own data.
 */
export function getDeviceId(): Promise<string> {
  cached ??= (async () => {
    const existing = await kvStorage.getItem(KEY);
    if (existing) return existing;
    const id = newUuid();
    await kvStorage.setItem(KEY, id);
    return id;
  })().catch((err) => {
    cached = null;
    throw err;
  });
  return cached;
}

export function __resetDeviceIdForTests(): void {
  cached = null;
}

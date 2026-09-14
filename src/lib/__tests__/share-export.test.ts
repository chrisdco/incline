import { describe, expect, it } from 'vitest';

import {
  nextShareBackgroundId,
  shareBackgroundById,
  shareHandleFromName,
} from '@/lib/share-chrome';

describe('share-export', () => {
  it('cycles background ids', () => {
    expect(nextShareBackgroundId('ink')).toBe('navy');
    expect(nextShareBackgroundId('slate')).toBe('ink');
    expect(shareBackgroundById('navy').card).toMatch(/^#/);
  });

  it('builds a share handle from a display name', () => {
    expect(shareHandleFromName('Chris Dcosta')).toBe('@chrisdcosta');
    expect(shareHandleFromName('  ')).toBe('@incline');
  });
});

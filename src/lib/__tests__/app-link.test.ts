import { describe, expect, it } from 'vitest';

import { withAppLink } from '../app-link';

describe('withAppLink', () => {
  it('adds the link on its own line', () => {
    expect(withAppLink('Train with me on Incline', 'https://x.test/get')).toBe('Train with me on Incline\nhttps://x.test/get');
  });
  it('leaves the message alone without a link or when already present', () => {
    expect(withAppLink('Hi', '')).toBe('Hi');
    expect(withAppLink('Hi https://x.test/get', 'https://x.test/get')).toBe('Hi https://x.test/get');
  });
});

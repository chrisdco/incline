import { describe, expect, it } from 'vitest';

import { clerkKeyProblem } from '../env';

const real = `pk_test_${Buffer.from('clever-otter-12.clerk.accounts.dev$').toString('base64')}`;

describe('clerkKeyProblem', () => {
  it('accepts a real-shaped key', () => {
    expect(clerkKeyProblem(real)).toBeNull();
    expect(clerkKeyProblem(real.replace(/=+$/, ''))).toBeNull();
  });

  it('rejects the .env.example placeholder that crashed alpha 1', () => {
    expect(clerkKeyProblem('pk_test_...')).not.toBeNull();
  });

  it('rejects missing, wrong-prefix and truncated keys', () => {
    expect(clerkKeyProblem('')).toBe('missing');
    expect(clerkKeyProblem('sk_test_abc')).toBe('not a pk_test_/pk_live_ key');
    expect(clerkKeyProblem(`pk_live_${Buffer.from('clerk.example.com').toString('base64')}`)).toBe('placeholder or truncated');
  });
});

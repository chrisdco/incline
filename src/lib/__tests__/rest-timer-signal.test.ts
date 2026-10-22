import { describe, expect, it, vi } from 'vitest';

import {
  consumeRestRequest,
  signalRestRequest,
  subscribeRestRequest,
} from '@/lib/rest-timer-signal';

describe('rest timer signal', () => {
  it('parks a cold-start request until a timer mounts', () => {
    signalRestRequest({ seconds: 60, sessionId: 7 });
    expect(consumeRestRequest()).toEqual({ seconds: 60, sessionId: 7 });
    expect(consumeRestRequest()).toBe(null);
  });

  it('delivers synchronously when a timer is already mounted', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRestRequest(listener);

    signalRestRequest({ seconds: 60, sessionId: 7 });
    expect(listener).toHaveBeenCalledWith({ seconds: 60, sessionId: 7 });

    // A live delivery is not parked, so a later mount cannot replay it.
    expect(consumeRestRequest(7)).toBe(null);
    unsubscribe();
  });

  it('leaves requests for another session parked', () => {
    signalRestRequest({ seconds: 60, sessionId: 9 });
    expect(consumeRestRequest(7)).toBe(null);
    expect(consumeRestRequest(9)).toEqual({ seconds: 60, sessionId: 9 });
  });

  it('parks again once every timer unsubscribes', () => {
    const unsubscribe = subscribeRestRequest(() => {});
    unsubscribe();

    signalRestRequest({ seconds: 30, sessionId: 1 });
    expect(consumeRestRequest(1)).toEqual({ seconds: 30, sessionId: 1 });
  });

  it('accepts unscoped requests on any session', () => {
    signalRestRequest({ seconds: 45 });
    expect(consumeRestRequest(3)).toEqual({ seconds: 45 });
  });
});

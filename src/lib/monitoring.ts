/**
 * Crash and error reporting (Sentry, #154).
 *
 * Release builds only: off in `__DEV__` (dev server, Expo Go) and whenever
 * `EXPO_PUBLIC_SENTRY_DSN` is unset, so local work never needs an account
 * and never sends noise. Every event is tagged with the release stage and
 * `formatRelease()` so an alpha crash is never mistaken for production.
 *
 * Privacy: no PII, no breadcrumbs from console, no screenshots. Workout
 * data stays on device; only stack traces and the release identity leave.
 */
import type { ComponentType } from 'react';
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

import { setErrorSink } from './error-sink';
import { formatRelease, releaseInfo } from './release';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

let enabled = false;

export function monitoringEnabled(): boolean {
  return enabled;
}

/** Call once, before the root component renders. Safe to call when disabled. */
export function initMonitoring(): void {
  // Data-layer background failures route through here (no-op until enabled).
  setErrorSink(reportError);
  if (__DEV__ || !DSN || enabled) return;
  const info = releaseInfo();
  Sentry.init({
    dsn: DSN,
    environment: info.stage,
    release: `incline@${info.version}+${info.build ?? '0'}`,
    dist: info.updateId ?? 'embedded',
    sendDefaultPii: false,
    attachScreenshot: false,
    attachViewHierarchy: false,
    // Errors only for now; tracing costs quota and adds no value pre-beta.
    tracesSampleRate: 0,
    beforeBreadcrumb: (crumb) => (crumb.category === 'console' ? null : crumb),
  });
  Sentry.setTag('release_label', formatRelease(info));
  Sentry.setTag('channel', info.channel ?? 'none');
  Sentry.setTag('runtime', info.runtimeVersion ?? 'none');
  Sentry.setTag('ota', Updates.isEmbeddedLaunch ? 'embedded' : 'update');
  enabled = true;
}

/** Report a caught error (error boundary, failed background job). No-op when disabled. */
export function reportError(error: unknown, context?: Record<string, string | number | boolean>): void {
  if (!enabled) return;
  Sentry.withScope((scope) => {
    if (context) scope.setExtras(context);
    Sentry.captureException(error);
  });
}

/** Wraps the root component so native crashes and touch breadcrumbs are captured. */
export function withMonitoring(component: ComponentType): ComponentType {
  return DSN && !__DEV__ ? Sentry.wrap(component as ComponentType<Record<string, unknown>>) : component;
}

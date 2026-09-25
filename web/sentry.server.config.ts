import * as Sentry from "@sentry/nextjs";

/** Server + edge errors. No DSN → SDK stays disabled. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

import * as Sentry from "@sentry/nextjs";

/** Client-side errors. No DSN → SDK stays disabled, so keyless builds work. */
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
});

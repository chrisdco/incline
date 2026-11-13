# Health data (Health Connect first, HealthKit next)

Decided 2026-11-13. Ships in Build 2 (WORK-QUEUE "Build 2").

## Decision

- **Android: [`react-native-health-connect`](https://github.com/matinzd/react-native-health-connect) 4.x.**
  Health Connect is Android's one store for health data, so one integration
  covers Samsung Health, Fitbit, Google Fit successors, Garmin/Oura/Withings
  (via their Health Connect sync) and anything else that writes there. The
  Expo config plugin ships inside the package since v4 (the separate
  `expo-health-connect` is deprecated). Most used and maintained RN binding
  (4.1.3, Aug 2026).
- **iOS (after Android is proven): [`@kingstinct/react-native-healthkit`](https://github.com/kingstinct/react-native-healthkit) 16.x.**
  Actively maintained (Oct 2026), typed, Nitro modules, config plugin for
  entitlements and usage strings, anchored queries for incremental sync.
  Adds `react-native-nitro-modules` (native).
- **Our own seam: `HealthPort`** (`src/health/`), a small interface
  (`isAvailable`, `requestRead(kinds)`, `read(kind, range)`, later
  `writeWorkout`). Screens and rules only see the port and our own record
  shapes; each platform gets an adapter. Swapping a library touches one file.
- **Samsung Health: through Health Connect, not its own SDK.** Samsung Health
  syncs both ways with Health Connect (since 6.22.5). The user turns it on in
  Samsung Health → Settings → Health Connect. The Samsung Health Data SDK
  needs partner approval and only adds Samsung-only metrics; not worth it.
  Onboarding copy tells Samsung users to enable that sync.

## Not chosen

| Option | Why not |
|---|---|
| `react-native-health` (agencyenterprise) | iOS only, last release Oct 2024, 157 open issues, old bridge |
| `@appeeky/expo-healthkit` | Nice idea (one Expo-module API, both platforms) but PolyForm Shield license (source-available, not open source), 0.x, two months old, one main maintainer. Revisit if it goes MIT/Apache and 1.0 |
| Unified wrappers (`react-native-healthx`, `react-native-health-link`, `@robinhealth/health-sdk`) | Thin, little use; they wrap the same two libraries. Our `HealthPort` is that layer, without the dependency |
| Aggregator APIs (Sahha, Spike, Terra, Validic) | Paid, data leaves the device through a third party; against local-first |
| Samsung Health Data SDK | Partner program, Samsung-only |

## Scope for Build 2 (read only)

Read: sleep sessions, resting heart rate, HRV (RMSSD), weight, steps.
Use: readiness rule (#7) on Home and in Ask (a `get_readiness` read tool),
weight into bodyweight entries (dedupe by source + time).
Write workouts to Health Connect: after read is proven (Build 3).

## Requirements and gotchas

- Native: new build, not OTA. `minSdkVersion` 26 via `expo-build-properties`.
- Play Console: Health Connect permissions declaration + privacy policy that
  names each data type and use; only request what we read.
- Permissions are per type and revocable at any time; every read handles
  "not granted" as an empty state, never an error.
- Health Connect keeps 30 days of history readable by default for new grants
  (older needs the history permission). Readiness only needs ~4 weeks.
- Data from before the user enabled Samsung's sync isn't backfilled.
- Consent: a health category in AI data use (G9) before Ask can read it.

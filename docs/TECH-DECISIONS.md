# Tech decisions — storage & lists
Short-lived alternatives log. Revisit only when a trigger below fires; otherwise keep current stack.

## 1. KV: SQLite `kv` table (not MMKV)

- **Decision:** keep `src/db/kv.ts` (`kvStorage` over `expo-sqlite`) as the sole persist layer for Zustand (`settings-store.ts`, `active-workout-store.ts`), readiness, plan/deload snooze, sync cursors (`ACCOUNT_PREFS_UPDATED_AT_KEY`, `ACTIVE_PROGRAM_KEY`), narrate cache. `expo-secure-store` stays only for Clerk tokens (`src/auth/secure-store.ts`).
- **Why:** single source of truth, transactional with workout data, trivial account-switch wipe + backup/restore, works in Expo Go, zero extra native deps, testable with `better-sqlite3` in vitest. Current payloads are small + low-frequency; async Zustand persist is fine.
- **Why not MMKV:** sync/fast but native-only → breaks Expo Go (needs dev-client/prebuild). Splits persistence in two, complicates sync wipe + restore, needs migration for no measured gain. Same for AsyncStorage (deprecated path per `expo-upgrade`; `expo-sqlite/localStorage` would be the replacement, still not needed).
- **Revisit when:** (a) measured jank from async kv on hot path (e.g. rest-timer tick, 60fps reads), (b) Reanimated worklet needs sync reads, (c) startup trace shows kv as bottleneck via `eas-observe`.
- **If revisited:** use MMKV for ephemeral UI prefs only; keep sync-related keys (`user_preferences`, active program, outbox cursors) in SQLite. Migrate one key at a time with dual-read + backfill, keep `kvStorage` interface shape so Zustand `createJSONStorage` swap is one line. Requires dev-client + EAS build verification; document Expo Go break.

## 2. Lists: FlashList (not LegendList)

- **Decision:** keep `@shopify/flash-list 2.0.2` for `exercises`, `workouts`, `progress` history, `exercise-picker-sheet`, `photo-picker-sheet`. Keep `FlatList` for small fixed lists (calendar, day, share pager) and `react-native-draggable-flatlist` for template reorder (LegendList cannot replace drag).
- **Why:** curated + `inExpoGo: true`, recycling on by default, quirks already paid for (`use-data.ts` keep-prior-rows, sheets mounted outside FlashList in `progress.tsx`). Current lists are <500 rows paginated; no perf complaint.
- **Why not LegendList now:** wins are variable-height blanks, lower CPU/memory on fast flings, `maintainVisibleContentPosition` / `maintainScrollAtEnd`, bidirectional infinite, no-invert chat. None are triggered yet. Costs: second list system, `recycleItems` opt-in to match FlashList perf (same state-reuse pitfalls), community churn (v2→v3) vs Expo-curated support.
- **Revisit when:** (a) history/feed shows blanks or scroll jump on variable heights, (b) chat coach lands (needs maintain-end, no-invert), (c) social feed #78 (prepend + maintain position), (d) catalog grows 10x with images.
- **If revisited:** spike on Progress history only: rename to `LegendList` + `recycleItems`, compare with Perf Monitor / FlashLight on a mid-tier Android, check `@expo/ui` sheet nesting + `onEndReached` parity. Keep `FlatList` for tiny lists, draggable list as-is. Both lists work in Expo Go, so Go is not a decider here.

## 3. Dev auth bypass (not MMKV/FlashList-related — recorded here)

- **Decision:** `EXPO_PUBLIC_DEV_BYPASS_AUTH=1` + dev bundle signs in as fake local user `dev` with no token (`src/auth/use-app-auth.ts`, gated by `isDevAuthBypassEnabled()` in `src/lib/env.ts`). All app code uses `useAppAuth()` instead of Clerk's `useAuth`.
- **Prod safety:** the flag requires `__DEV__` (false + dead-code-eliminated in release); a set flag in a prod bundle logs a warning and is ignored. Bypass path ships no credentials and makes no network calls — sync/narrate fall into their existing unauthenticated null-paths, and sync is explicitly disabled in `use-cloud-sync.ts`.
- **Dev-testing safety:** bypass data is throwaway — `bindLocalAccount('dev')` claims the DB owner, so signing in with a real account later wipes it via the normal account-switch path (`src/db/account.ts`). Sign-out row is hidden in bypass to avoid a confusing bounce.
- **Revisit when:** never for removal rationale — keep indefinitely as a dev tool. Extend only if new `useAuth` call sites appear (grep `@clerk/expo` — only `(auth)/` screens should import it directly).

## 4. Set types: working / warmup / drop / failure

- **Decision:** `SetType` expanded beyond `working | warmup` (`src/db/types.ts`). Rule: only pure `working` drives PR/overload/ghost records ("back-offs cannot win", extending the warm-up rule); `drop`/`failure` count toward volume like working, carry RPE, and sync as raw `TEXT` (server column unconstrained). No migration needed.
- **UI:** set number is a button opening a 4-option sheet (`SetRow` → `ExerciseBlock` menu); non-working sets show a W/D/F tag under the number. Tap-to-complete, keyboard chain, and swipe-delete unchanged.
- **Revisit when:** Track B (#126 volume definition) may re-scope whether drop/failure belong in working volume — that decision owns this one.

## 5. Session loading: split cheap rows from assist fan-out

- **Decision:** `load()` split into `loadSession()` (rows only) + `loadAssist()` (last-sets/PR/suggestions/ghost, run-guarded against stale responses). Field edits never touch assist; structural changes (add/undo) use `reloadAll()`. Failure paths still reload from SQLite truth.
- **Why:** assist data cannot change on a keystroke; refiring it per edit was the wasteful half of session jank. No new architecture — write-through state + targeted invalidation approximates what native reactive stores do (see §6).
- **Revisit when:** only if session open itself feels slow (then: defer ghost/suggestions below the fold, not a store rewrite).

## 6. What native competitors do (Hevy / Lyfta / Strong) and our scope

- **Their stack (informed inference — none publish it):** fully native iOS + Android codebases, local DB as truth (Core Data / Room / Realm) with reactive observation (diffed, surgical UI updates — never refetch-on-edit), synchronous write-through transactions, background sync operation queues, release builds only, teams of 10–30 with years of perf iteration. Lyfta's tag set (Warm Up, Failure, Drop, Negative, Left/Right) matches our 4 types; Negative/L-R are easy later additions (`isSetType` passthrough + TEXT column already allow it).
- **The gap you feel is three stacked things:** (a) dev-vs-release — Expo Go dev is unminified, unoptimized JS; their apps are release native. This alone dwarfs architecture. (b) Reactive-native vs our RN bridge (narrowing: New Architecture + write-through already converge the UX). (c) Polish backlog (memoization where measured, list tuning).
- **Justification for our scope:** solo/small team, one cross-platform codebase, pre-alpha proving sync correctness. Nothing above requires a rewrite: expo-sqlite + write-through + split loads is the same UX contract as their reactive stores. WatermelonDB/Realm would need native modules (breaks Expo Go) for no user-visible gain.
- **Merge later, only if measured:** normalized reactive mirror, Skia charts, release-build perf discipline (dev-client profiling before any perf claim).

## 7. Session reopen: stale-while-revalidate, not remount-and-spinner

- **Decision:** in-memory session cache (`src/db/session-cache.ts`, cap 5). Reopen renders cached rows synchronously + refreshes in background; tray/resume pushes warm it first (`setCachedSession` sync where the object is held, `getWorkoutLog` fire-and-forget from the tray). True cold opens show a layout-matching skeleton, never a bare spinner.
- **Safety:** single-writer; `resetUserData()` clears the cache (ids restart after wipe, so stale entries could otherwise cross accounts); finish/discard drop their entry.
- **Rule for elsewhere:** same treatment when a push-then-back flow flashes — cache + warm + skeleton. Do not hand-roll JS transitions; the native Stack push is already the cheapest animation. Candidates if reported: workout preview, exercise detail, summary.

## 8. Touch + gesture rules learned (tray, swipe, home hero)

- **Tray:** whole bar opens, only the trash circle deletes; feedback is opacity (works on iOS too — `android_ripple` is Android-only, so iOS taps felt dead).
- **Swipe over inputs:** `TextInput` must come from `react-native-gesture-handler`, not `react-native` — native inputs eat the swipe gesture on Android. Set-type sheet also carries Delete as a discoverable fallback.
- **Home hero:** skeletons gate on `loading && data == null`, never `loading` alone — focus refetches must not flash placeholders over content. Same rule anywhere `useAsync` preserves data.

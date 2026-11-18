# Releases and the share link

**Status:** live 2026-11-18. Owner: app.

## The link

`EXPO_PUBLIC_APP_SHARE_URL` (all EAS environments) is
`https://hgzihfjzfwdemjaeledc.supabase.co/functions/v1/app-release`. It never
names a build, so shared workout cards keep working across builds.

`app-release` (Supabase edge function, public):

| Request | Result |
| --- | --- |
| `GET /app-release` | 302 to the newest Android build: GitHub mirror, else the EAS page while its artifact is live, else the GitHub releases page |
| `GET ?format=json` | `{ latest, recent[5], install_url }`, the feed for in-app "What's new" |
| `?platform=ios`, `?profile=beta` | narrow the pick |
| `POST` (EAS webhook) | HMAC-SHA1 `expo-signature`; stores finished builds on alpha/beta/preview/production in `app_releases` |
| `POST {kind:'mirror'}` | same HMAC; the mirror workflow records the permanent URL |

## Why a mirror

EAS internal-distribution artifacts expire (the 2026-11-05 alpha expires
2026-11-19). `.github/workflows/release-mirror.yml` copies the newest
shareable APK to a GitHub Release (`incline.apk`, marked latest) every 3h
or on demand, so the link outlives EAS retention. It needs repo secrets
`EXPO_TOKEN` and `EAS_WEBHOOK_SECRET` and skips without them.

## What's new

One pack, `src/contracts/releases/whats-new.ts`, read by every surface:

- **App:** Home opens a What's new sheet with every unseen item as a swipeable
  card (newest first, max 5), page dots, one primary action that follows the
  card, and Later. Never during a workout. Seen ids share the announcement
  dismiss list.
- **Web:** dashboard "What's new" row (snap carousel on phones, grid on wide
  screens) with the always-latest download link.
- **Feed:** the webhook writes each build's `notes` as the pack items added
  since the previous build, so `?format=json` says what is new in it.

Add an item in the same PR as its feature; never reuse an id.

## Rules

- Only shareable profiles count; emulator/development builds never reach users.
- `hidden = true` pulls a bad build from the link without deleting history.
- The webhook secret lives in Supabase secrets (`EAS_WEBHOOK_SECRET`) and the
  GitHub repo secret of the same name; rotate both together
  (`eas webhook:update`).

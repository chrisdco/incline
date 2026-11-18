# Abuse management (AI endpoints, MCP, share link)

**Status:** layers 1-5 live 2026-11-18; 6-8 planned.

Managed AI costs money per call, so every layer below caps spend without
hurting a real lifter. Each layer fails closed.

| # | Layer | Where | Limit |
| --- | --- | --- | --- |
| 1 | Auth | every AI/MCP call | Clerk JWT (app/web), hashed MCP token (Claude) |
| 2 | Per-user daily quota | `ai_task_consume` | per task (`dailyLimit`), chat 150 steps, MCP calls |
| 3 | Device trust | Play Integrity (`attestedLimit`) | unattested clients get a fraction of the quota |
| 4 | Burst | `_shared/edge/abuse.ts` | 24/min chat, 10/min other tasks; returns `busy` (try again), not "today's limit" |
| 5 | Global spend breaker | same | `AI_GLOBAL_DAILY` (default 5000) upstream calls/day across all accounts; Sybil guard |
| 5b | Write caps | MCP `propose_progression_change` | 20 proposals/day; unsafe ones are refused, never queued |
| - | Kill switches | `ai_flags` | per task, remote, no deploy |
| - | Tiers | `ai_user_tiers` | testers get a multiplier |
| - | BYOK | app | own key = own spend, no managed quota |

## Planned

6. **New-account ramp:** quota scales with account age and logged workouts
   (a fresh account with no history gets ~25%). Cheap: one profile read.
7. **Anomaly alert:** daily job flags users at >80% of quota several days in
   a row, or the global breaker tripping; email the owner.
8. **Cost ledger:** record tokens per call (already in `meta.usage`) to a
   daily table, so the global cap can be in dollars, not calls.

## Share link

`app-release` is read-only and public; the only write path is HMAC-signed.
Response caching (5 min) keeps it cheap if a link goes viral.

import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getActiveWorkout, getMonthlyRecap, getProgressStats, getWeeklyRecap } from '@/db/queries';
import { evaluateAchievements } from '@/lib/achievements';
import {
  mondayWeekKey,
  newlyUnlockedAchievementIds,
  scheduleAbandonedNudge,
  scheduleMilestoneNudge,
  scheduleStreakNudge,
  shouldNudgeAbandoned,
  shouldNudgeStreak,
} from '@/lib/notifications/nudges';
import { useSettings } from '@/store/settings-store';

/**
 * Evaluate capped nudges on foreground: abandoned session, streak at risk,
 * newly unlocked milestones. Each family is opt-in and self-capping (one
 * ping per session / week / achievement — see nudges.ts).
 */
export function useNudgeSync() {
  const abandonedEnabled = useSettings((s) => s.abandonedNudgeEnabled);
  const streakEnabled = useSettings((s) => s.streakNudgeEnabled);
  const milestoneEnabled = useSettings((s) => s.milestoneNudgeEnabled);
  const unit = useSettings((s) => s.unit);
  const syncing = useRef(false);

  useEffect(() => {
    if (!abandonedEnabled && !streakEnabled && !milestoneEnabled) return;
    let cancelled = false;

    const run = async () => {
      if (syncing.current) return;
      syncing.current = true;
      try {
        const s = useSettings.getState();
        const now = Date.now();

        if (abandonedEnabled && !cancelled) {
          try {
            const active = await getActiveWorkout();
            if (active && !cancelled) {
              // Log updated_at moves on every set write (see recomputeVolume),
              // so it doubles as last-activity for the idle check.
              const lastActivity = Math.max(
                active.updatedAt,
                active.startedAt,
                ...active.sets.map((set) => set.createdAt),
              );
              if (shouldNudgeAbandoned(now, lastActivity, s.lastAbandonedNudgeLogId, active.id)) {
                const ok = await scheduleAbandonedNudge(active.id, active.name);
                if (ok && !cancelled) s.markAbandonedNudged(active.id);
              }
            }
          } catch {
            // DB read or schedule failed — try again next foreground.
          }
        }

        if (streakEnabled && !cancelled) {
          try {
            const [recap, monthly] = await Promise.all([
              getWeeklyRecap(now, unit),
              getMonthlyRecap(now, unit),
            ]);
            if (!cancelled) {
              const weekKey = mondayWeekKey(now);
              if (
                shouldNudgeStreak(now, monthly.streak, recap.sessions, s.lastStreakNudgeWeekKey)
              ) {
                const ok = await scheduleStreakNudge(monthly.streak, weekKey);
                if (ok && !cancelled) s.markStreakNudged(weekKey);
              }
            }
          } catch {
            // try again next foreground
          }
        }

        if (milestoneEnabled && !cancelled) {
          try {
            const stats = await getProgressStats(8);
            if (!cancelled) {
              const fresh = useSettings.getState();
              const statuses = evaluateAchievements(stats);
              const ids = newlyUnlockedAchievementIds(fresh.seenAchievementIds, statuses);
              for (const id of ids) {
                const def = statuses.find((a) => a.id === id);
                if (!def) continue;
                const ok = await scheduleMilestoneNudge(id, def.title, def.description);
                if (!ok || cancelled) break;
              }
              if (!cancelled) {
                const unlockedNow = statuses.filter((a) => a.unlocked).map((a) => a.id);
                fresh.markAchievementsSeen(unlockedNow);
              }
            }
          } catch {
            // try again next foreground
          }
        }
      } finally {
        syncing.current = false;
      }
    };

    void run();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') void run();
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [abandonedEnabled, streakEnabled, milestoneEnabled, unit]);
}

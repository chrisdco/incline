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
import { runExclusive } from '@/lib/run-exclusive';
import { useSettings } from '@/store/settings-store';

type NudgeFamilies = { abandonedEnabled: boolean; streakEnabled: boolean; milestoneEnabled: boolean };

/**
 * One pass over the enabled nudge families. Module-level because React
 * Compiler can't lower conditionals inside try/catch in a hook.
 */
async function evaluateNudges(
  { abandonedEnabled, streakEnabled, milestoneEnabled }: NudgeFamilies,
  unit: Parameters<typeof getWeeklyRecap>[1],
  isCancelled: () => boolean,
) {
  const s = useSettings.getState();
  const now = Date.now();

  if (abandonedEnabled && !isCancelled()) {
    try {
      const active = await getActiveWorkout();
      if (active && !isCancelled()) {
        // Log updated_at moves on every set write (see recomputeVolume),
        // so it doubles as last-activity for the idle check.
        const lastActivity = Math.max(
          active.updatedAt,
          active.startedAt,
          ...active.sets.map((set) => set.createdAt),
        );
        if (shouldNudgeAbandoned(now, lastActivity, s.lastAbandonedNudgeLogId, active.id)) {
          const ok = await scheduleAbandonedNudge(active.id, active.name);
          if (ok && !isCancelled()) s.markAbandonedNudged(active.id);
        }
      }
    } catch {
      // DB read or schedule failed — try again next foreground.
    }
  }

  if (streakEnabled && !isCancelled()) {
    try {
      const [recap, monthly] = await Promise.all([
        getWeeklyRecap(now, unit),
        getMonthlyRecap(now, unit),
      ]);
      if (!isCancelled()) {
        const weekKey = mondayWeekKey(now);
        if (
          shouldNudgeStreak(now, monthly.streak, recap.sessions, s.lastStreakNudgeWeekKey)
        ) {
          const ok = await scheduleStreakNudge(monthly.streak, weekKey);
          if (ok && !isCancelled()) s.markStreakNudged(weekKey);
        }
      }
    } catch {
      // try again next foreground
    }
  }

  if (milestoneEnabled && !isCancelled()) {
    try {
      const stats = await getProgressStats(8);
      if (!isCancelled()) {
        const fresh = useSettings.getState();
        const statuses = evaluateAchievements(stats);
        const ids = newlyUnlockedAchievementIds(fresh.seenAchievementIds, statuses);
        for (const id of ids) {
          const def = statuses.find((a) => a.id === id);
          if (!def) continue;
          const ok = await scheduleMilestoneNudge(id, def.title, def.description);
          if (!ok || isCancelled()) break;
        }
        if (!isCancelled()) {
          const unlockedNow = statuses.filter((a) => a.unlocked).map((a) => a.id);
          fresh.markAchievementsSeen(unlockedNow);
        }
      }
    } catch {
      // try again next foreground
    }
  }
}

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

    const run = () =>
      runExclusive(syncing, () =>
        evaluateNudges({ abandonedEnabled, streakEnabled, milestoneEnabled }, unit, () => cancelled),
      );

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

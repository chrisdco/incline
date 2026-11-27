import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { getActiveWorkout, getMonthlyRecap, getProgressStats, getWeeklyRecap } from '@/db/queries';
import { evaluateAchievements } from '@/lib/achievements';
import {
  abandonedNudgeDelaySeconds,
  cancelAbandonedNudge,
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

/** The abandoned ping scheduled on leaving the app: which session, and when it fires. */
type PendingAbandoned = { logId: number; at: number } | null;

function lastActivityOf(active: NonNullable<Awaited<ReturnType<typeof getActiveWorkout>>>): number {
  // Log updated_at moves on every set write (see recomputeVolume),
  // so it doubles as last-activity for the idle check.
  return Math.max(active.updatedAt, active.startedAt, ...active.sets.map((set) => set.createdAt));
}

/**
 * Leaving the app with a session open: schedule the ping for the end of the
 * idle window, so it reaches the user who walked out of the gym (the
 * foreground check alone only ever fired once they came back).
 */
async function scheduleOnLeave(pending: { current: PendingAbandoned }) {
  try {
    const active = await getActiveWorkout();
    if (!active) return;
    const s = useSettings.getState();
    const now = Date.now();
    const delay = abandonedNudgeDelaySeconds(now, lastActivityOf(active), s.lastAbandonedNudgeLogId, active.id);
    if (delay == null) return;
    if (await scheduleAbandonedNudge(active.id, active.name, delay)) pending.current = { logId: active.id, at: now + delay * 1000 };
  } catch {
    // Best effort: the foreground check still covers the next open.
  }
}

/**
 * Back in the app: a ping whose time passed already fired, so count it
 * (one per session); one still pending is cancelled, since the user is here.
 */
async function settleOnReturn(pending: { current: PendingAbandoned }) {
  const p = pending.current;
  if (!p) return;
  pending.current = null;
  if (Date.now() >= p.at) useSettings.getState().markAbandonedNudged(p.logId);
  else await cancelAbandonedNudge();
}

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
        const lastActivity = lastActivityOf(active);
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
        const statuses = evaluateAchievements(stats, unit);
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
 * Abandoned pings are scheduled on leaving the app and settled on return
 * (see scheduleOnLeave). Evaluate capped nudges on foreground: abandoned session, streak at risk,
 * newly unlocked milestones. Each family is opt-in and self-capping (one
 * ping per session / week / achievement — see nudges.ts).
 */
export function useNudgeSync() {
  const abandonedEnabled = useSettings((s) => s.abandonedNudgeEnabled);
  const streakEnabled = useSettings((s) => s.streakNudgeEnabled);
  const milestoneEnabled = useSettings((s) => s.milestoneNudgeEnabled);
  const unit = useSettings((s) => s.unit);
  const syncing = useRef(false);
  const pendingAbandoned = useRef<PendingAbandoned>(null);

  useEffect(() => {
    if (!abandonedEnabled && !streakEnabled && !milestoneEnabled) return;
    let cancelled = false;

    const run = () =>
      runExclusive(syncing, () =>
        evaluateNudges({ abandonedEnabled, streakEnabled, milestoneEnabled }, unit, () => cancelled),
      );

    void run();

    const onAppState = (state: AppStateStatus) => {
      if (state === 'active') {
        void settleOnReturn(pendingAbandoned).then(run);
      } else if (state === 'background' && abandonedEnabled) {
        void scheduleOnLeave(pendingAbandoned);
      }
    };
    const sub = AppState.addEventListener('change', onAppState);
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [abandonedEnabled, streakEnabled, milestoneEnabled, unit]);
}

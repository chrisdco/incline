import { CHAT_HEALTH_TOOLS } from '@/contracts/ai/chat-tools';
import type { Json } from '@/contracts/ai/chat';
import { getHealthPort, type HealthPort } from '@/health';
import { readHealthSnapshot, type HealthSnapshot } from '@/health/readiness';

import type { DeviceTool } from './read-tools';

/**
 * Device health tools (HEALTH.md, G9). Offered only when the user turned on
 * both Health Connect and "Use in Ask"; otherwise the model never sees them.
 * Output is the readiness rule's daily aggregates, never raw samples.
 */

/** The snapshot as the model sees it: snake_case, units in the keys, nulls when not shared. */
export function readinessResult(s: HealthSnapshot): Json {
  return {
    shared: s.granted,
    last_night_sleep_minutes: s.lastNightSleepMinutes,
    avg_sleep_minutes_7d: s.avgSleepMinutes7d,
    hrv_ms: s.hrv ? { today: s.hrv.today, usual: s.hrv.baseline } : null,
    resting_hr_bpm: s.restingHeartRate ? { today: s.restingHeartRate.today, usual: s.restingHeartRate.baseline } : null,
    steps_today: s.stepsToday,
    latest_weight_kg: s.latestWeightKg,
    suggestion: s.suggestion ? { level: s.suggestion.level, signals: s.suggestion.signals.map((x) => x.text) } : null,
    note: 'From the phone health store; usual = median of the last 4 weeks. Null means not shared or no reading.',
  };
}

export function deviceHealthTools(
  settings: { healthConnectEnabled: boolean; healthInAskEnabled: boolean },
  port: () => HealthPort = getHealthPort,
): DeviceTool[] {
  if (!settings.healthConnectEnabled || !settings.healthInAskEnabled) return [];
  return CHAT_HEALTH_TOOLS.filter((spec) => spec.name === 'get_readiness').map((spec) => ({
    spec,
    async run() {
      return readinessResult(await readHealthSnapshot(port()));
    },
  }));
}

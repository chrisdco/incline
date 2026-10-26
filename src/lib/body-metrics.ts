import { cmToDisplay, kgToDisplay } from '@/lib/units';
import type { BodyMetric, Unit } from '@/db/types';
import { BODY_METRICS } from '@/db/types';

export const BODY_METRIC_LABELS: Record<BodyMetric, string> = {
  bodyweight: 'Bodyweight',
  arms: 'Arms',
  chest: 'Chest',
  waist: 'Waist',
  hips: 'Hips',
  thighs: 'Thighs',
  calves: 'Calves',
};

/** Canonical kg (bodyweight) or cm (circumference) → the display number. */
export function bodyMetricToDisplay(metric: BodyMetric, canonical: number, unit: Unit): number {
  return metric === 'bodyweight' ? kgToDisplay(canonical, unit) : cmToDisplay(canonical, unit);
}

export function bodyMetricUnit(metric: BodyMetric, unit: Unit): string {
  if (metric === 'bodyweight') return unit === 'metric' ? 'kg' : 'lb';
  return unit === 'metric' ? 'cm' : 'in';
}

export function sanitizeEnabledBodyMetrics(value: unknown): BodyMetric[] {
  if (!Array.isArray(value)) return ['bodyweight', 'waist', 'arms', 'chest'];
  const cleaned = [
    ...new Set(
      value.filter(
        (m): m is BodyMetric =>
          typeof m === 'string' && (BODY_METRICS as string[]).includes(m),
      ),
    ),
  ];
  if (!cleaned.includes('bodyweight')) cleaned.unshift('bodyweight');
  return cleaned.length > 0 ? cleaned : ['bodyweight', 'waist', 'arms', 'chest'];
}

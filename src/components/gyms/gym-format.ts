import type { Gym, Unit } from '@/db/types';

export function gymUnitLabel(unit: Unit): 'kg' | 'lb' {
  return unit === 'imperial' ? 'lb' : 'kg';
}

/** "20 kg bar · 7 plate sizes" — the one-line description under a gym's name. */
export function gymSummary(gym: Pick<Gym, 'unit' | 'barWeight' | 'plates'>): string {
  const u = gymUnitLabel(gym.unit);
  const n = gym.plates.length;
  return `${formatPlate(gym.barWeight)} ${u} bar · ${n} plate size${n === 1 ? '' : 's'}`;
}

/** 1.25 → "1.25", 20 → "20". */
export function formatPlate(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

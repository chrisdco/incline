/**
 * Number/date formatting mirrored from the mobile app (db/calc).
 *
 * Storage rule (TECH-DECISIONS §15): loads in Supabase are canonical kg.
 * `formatWeight`/`formatVolume` take a value already in the display unit —
 * convert with `toDisplayWeight` (or `kgToDisplay`) first.
 */

export const LB_PER_KG = 2.2046226218;

/** Canonical kg → the number shown in `unit` ('metric' | 'imperial'). */
export function kgToDisplay(kg: number, unit: string): number {
  return unit === "imperial" ? kg * LB_PER_KG : kg;
}

export function formatWeight(weight: number, unit: string): string {
  const suffix = unit === "imperial" ? "lb" : "kg";
  const rounded = Math.round(weight * 10) / 10;
  const digits = Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(1);
  return `${digits} ${suffix}`;
}

export function formatVolume(volume: number, unit: string): string {
  const suffix = unit === "imperial" ? "lb" : "kg";
  if (volume >= 10000) return `${(volume / 1000).toFixed(1)}k ${suffix}`;
  return `${Math.round(volume).toLocaleString()} ${suffix}`;
}

export function formatDuration(totalSeconds: number): string {
  if (totalSeconds < 3600) {
    const m = Math.floor(totalSeconds / 60);
    return `${m}m`;
  }
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/**
 * Convert a stored weight to the display unit. Logs written before §15 by
 * the web importer may still carry 'imperial' (see supabase/units-canonical.sql).
 */
export function toDisplayWeight(value: number, fromUnit: string, displayUnit: string): number {
  if (fromUnit === displayUnit) return value;
  return fromUnit === "imperial" ? value / LB_PER_KG : value * LB_PER_KG;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function weekStart(d = new Date()): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  const day = (copy.getDay() + 6) % 7; // Monday start
  copy.setDate(copy.getDate() - day);
  return copy;
}

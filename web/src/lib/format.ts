/** Number/date formatting mirrored from the mobile app (db/calc). */

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

/** Convert a stored weight to the display unit (rows carry their own unit). */
export function toDisplayWeight(value: number, fromUnit: string, displayUnit: string): number {
  if (fromUnit === displayUnit) return value;
  return fromUnit === "imperial" ? value / 2.20462 : value * 2.20462;
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

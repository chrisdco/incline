import type { Unit } from './types';
import { kgToDisplay, LB_PER_KG, weightLabel } from '@/lib/units';

/** Format a millisecond timestamp as a local YYYY-MM-DD string. */
export function isoDate(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Milliseconds of the start of the day containing `ms`. */
export function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Milliseconds of the Monday starting the week containing `ms`. */
export function startOfWeek(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1;
  d.setDate(d.getDate() - diff);
  return d.getTime();
}

export function weekBounds(weekStartMs: number): { startMs: number; endMs: number } {
  const startMs = startOfWeek(weekStartMs);
  return { startMs, endMs: startMs + 7 * 86_400_000 };
}

/** Human label e.g. "Aug 4–10" for a Monday-based week. */
export function formatWeekRangeLabel(weekStartMs: number): string {
  const { startMs, endMs } = weekBounds(weekStartMs);
  const start = new Date(startMs);
  const end = new Date(endMs - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString(undefined, opts)}–${end.toLocaleDateString(undefined, opts)}`;
}

/** Local midnight on the 1st of the month containing `ms`. */
export function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function monthBounds(ms: number): { startMs: number; endMs: number } {
  const startMs = startOfMonth(ms);
  const end = new Date(startMs);
  end.setMonth(end.getMonth() + 1);
  return { startMs, endMs: end.getTime() };
}

/** `YYYY-MM` for the month containing `ms`. */
export function monthKey(ms: number): string {
  const d = new Date(startOfMonth(ms));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function formatMonthLabel(ms: number): string {
  return new Date(startOfMonth(ms)).toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

/** First day of the calendar month before the one containing `ms`. */
export function previousMonthStart(ms = Date.now()): number {
  const d = new Date(startOfMonth(ms));
  d.setMonth(d.getMonth() - 1);
  return d.getTime();
}

/** Monday=1 … Sunday=7 (ISO-style weekday for program day slots). */
export function weekdayMon1(ms: number): number {
  const d = new Date(ms).getDay();
  return d === 0 ? 7 : d;
}

/** Estimated one-rep max via the Epley formula. */
export function estimated1RM(weight: number, reps: number): number {
  if (reps <= 0 || weight <= 0) return 0;
  if (reps === 1) return Math.round(weight * 100) / 100;
  return Math.round(weight * (1 + reps / 30) * 100) / 100;
}

/**
 * Minimum reps at `weight` needed to strictly beat `best1RM` (Epley).
 * Returns null when the ask is unrealistic (>30 reps) or inputs are invalid.
 */
export function repsToBeat1RM(weight: number, best1RM: number): number | null {
  if (weight <= 0 || best1RM <= 0) return null;
  if (weight > best1RM) return 1;
  const exact = 30 * (best1RM / weight - 1);
  const reps = Math.floor(exact) + 1;
  if (reps < 1 || reps > 30) return null;
  return reps;
}

/** Volume of a single set (weight x reps), rounded to 2dp. */
export function setVolume(weight: number, reps: number): number {
  return Math.round(weight * reps * 100) / 100;
}

export const KG_TO_LB = LB_PER_KG;

export function convertWeight(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'metric' ? value * KG_TO_LB : value / KG_TO_LB;
}

/** Canonical kg → "61.2 kg" / "135 lb" in the display unit. */
export function formatWeight(kg: number, unit: Unit): string {
  if (kg <= 0) return '—';
  return formatDisplayWeight(kgToDisplay(kg, unit), unit);
}

/** A number already in the display unit (chart axes, tools) → "135 lb". */
export function formatDisplayWeight(value: number, unit: Unit): string {
  if (value <= 0) return '—';
  const v = Math.round(value * 10) / 10;
  const str = v % 1 === 0 ? v.toFixed(0) : v.toFixed(1);
  return `${str} ${weightLabel(unit)}`;
}

export function formatReps(reps: number): string {
  return reps <= 0 ? '—' : `${reps}`;
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec.toString().padStart(2, '0')}s`;
  return `${sec}s`;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
}

/** Canonical kg volume → "12.3k kg" / "980 lb" in the display unit. */
export function formatVolume(kg: number, unit: Unit): string {
  return formatDisplayVolume(kgToDisplay(kg, unit), unit);
}

/** A volume already in the display unit (chart axes) → "12.3k lb". */
export function formatDisplayVolume(value: number, unit: Unit): string {
  const v = Math.round(value);
  const suffix = weightLabel(unit);
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k ${suffix}`;
  return `${v} ${suffix}`;
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return new Date(ms).toLocaleDateString();
}

export function formatFullDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export function formatFullDateTime(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }) + ' · ' + d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Clamp a number between min and max. */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Format seconds as mm:ss for timer display. Alias for formatClock. */
export const formatTime = formatClock;

/** One-rep max estimate (alias for estimated1RM). */
export const oneRepMax = estimated1RM;

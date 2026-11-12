import type { NormSet } from '@/contracts/mcp/shape';
import { estimate1rm, toUnit, unitLabel, weeklyMuscleSets, type Unit } from '@/contracts/mcp/tools';

/**
 * Ask's idle brief (ASK-UI.md "The shell"): one headline and up to three
 * insight cards, built by rules from logged sets. No model call, so it's
 * instant, free and works offline. Every number here comes from our calc;
 * the card's question is what gets sent if the user taps it.
 */

/** The dither scene a headline asks for (ASK-UI.md "Contextual visuals"). */
export type SceneKind = 'mark' | 'rise' | 'steady' | 'gap' | 'balance' | 'fresh';

export type InsightKind = 'pr' | 'rising' | 'stalled' | 'balance' | 'break' | 'streak';

export interface Insight {
  kind: InsightKind;
  /** One line for the headline slot. */
  headline: string;
  /** The number, shown on the card. */
  metric: string;
  /** What tapping the card asks. */
  question: string;
}

export interface AskBrief {
  headline: string;
  scene: SceneKind;
  cards: Insight[];
  /** Distinct sessions seen; under MIN_SESSIONS the brief is the starter state. */
  sessions: number;
}

const DAY = 86_400_000;
export const MIN_SESSIONS = 3;
/** A lift needs this many sessions in the window before we call a trend. */
const TREND_SESSIONS = 4;
const TREND_WINDOW = 8 * 7 * DAY;
const RISE = 0.025;
const FLAT = 0.01;
const BREAK_DAYS = 7;
/** Weekly sets per muscle we treat as a reasonable floor (common hypertrophy guidance: ~10). */
const MUSCLE_FLOOR = 10;
const BALANCE_WEEKS = 4;
/** Big groups only: a low calf or forearm count isn't a headline. */
const MAJOR = ['chest', 'back', 'shoulders', 'quads', 'hamstrings', 'glutes'] as const;

const PRIORITY: InsightKind[] = ['pr', 'rising', 'stalled', 'balance', 'break', 'streak'];
const SCENE: Record<InsightKind, SceneKind> = {
  pr: 'rise',
  rising: 'rise',
  stalled: 'gap',
  balance: 'balance',
  break: 'gap',
  streak: 'steady',
};

const label = (m: string) => m.charAt(0).toUpperCase() + m.slice(1).replace('_', ' ');
const lower = (s: string) => s.toLowerCase();

interface Session {
  at: number;
  e1rm: number;
}

/** Best e1RM per session, per exercise, oldest first. */
function sessionsByExercise(sets: readonly NormSet[]): Map<string, { name: string; sessions: Session[] }> {
  const byKey = new Map<string, { name: string; logs: Map<string, Session> }>();
  for (const s of sets) {
    const e = s.weightKg > 0 ? estimate1rm(s.weightKg, s.reps) : null;
    if (e === null) continue;
    const g = byKey.get(s.exerciseKey) ?? { name: s.exercise, logs: new Map() };
    const cur = g.logs.get(s.logId);
    if (!cur || e > cur.e1rm) g.logs.set(s.logId, { at: Date.parse(s.startedAt), e1rm: e });
    byKey.set(s.exerciseKey, g);
  }
  const out = new Map<string, { name: string; sessions: Session[] }>();
  for (const [k, g] of byKey)
    out.set(k, {
      name: g.name,
      sessions: [...g.logs.values()].sort((a, b) => a.at - b.at),
    });
  return out;
}

function liftInsights(sets: readonly NormSet[], unit: Unit, now: number): Insight[] {
  const u = unitLabel(unit);
  const w = (kg: number) => `${toUnit(kg, unit)} ${u}`;
  const prs: (Insight & { gain: number })[] = [];
  const trends: (Insight & { gain: number })[] = [];
  for (const { name, sessions } of sessionsByExercise(sets).values()) {
    // PR: the latest session (this week) beats every earlier one, with enough history to mean it.
    const last = sessions.at(-1);
    const before = sessions.slice(0, -1);
    if (last && before.length >= MIN_SESSIONS - 1 && now - last.at <= 7 * DAY) {
      const prev = Math.max(...before.map((s) => s.e1rm));
      if (last.e1rm > prev) {
        prs.push({
          kind: 'pr',
          headline: `New best on ${name}`,
          metric: `${name} e1RM ${w(prev)} → ${w(last.e1rm)}`,
          question: `What's driving my ${lower(name)} progress?`,
          gain: last.e1rm / prev - 1,
        });
        continue;
      }
    }
    // Trend: first two vs last two sessions in the window.
    const recent = sessions.filter((s) => now - s.at <= TREND_WINDOW);
    if (recent.length < TREND_SESSIONS) continue;
    const avg = (xs: Session[]) => xs.reduce((a, s) => a + s.e1rm, 0) / xs.length;
    const from = avg(recent.slice(0, 2));
    const to = avg(recent.slice(-2));
    const gain = to / from - 1;
    if (gain >= RISE) {
      trends.push({
        kind: 'rising',
        headline: `${name} is up ${w(to - from)} over ${recent.length} sessions`,
        metric: `${name} e1RM ${w(from)} → ${w(to)}`,
        question: `What's driving my ${lower(name)} progress?`,
        gain,
      });
    } else if (Math.abs(gain) < FLAT) {
      trends.push({
        kind: 'stalled',
        headline: `${name} has held at ${w(to)} for ${recent.length} sessions`,
        metric: `${name} e1RM flat at ${w(to)}`,
        question: `Why has my ${lower(name)} stalled?`,
        gain: -1,
      });
    }
  }
  prs.sort((a, b) => b.gain - a.gain);
  trends.sort((a, b) => b.gain - a.gain);
  return [...prs, ...trends].map(({ gain: _gain, ...i }) => i);
}

function balanceInsight(sets: readonly NormSet[], now: number): Insight | null {
  const perMuscle = weeklyMuscleSets(
    sets.map((s) => ({
      startedAt: s.startedAt,
      primaryMuscle: s.primaryMuscle,
      secondaryMuscles: [...s.secondaryMuscles],
    })),
    BALANCE_WEEKS,
    now,
  );
  const avg = (m: string) => (perMuscle[m] ?? []).reduce((a, b) => a + b, 0) / BALANCE_WEEKS;
  // Only meaningful when something else is trained to the floor.
  if (!MAJOR.some((m) => avg(m) >= MUSCLE_FLOOR)) return null;
  const low = MAJOR.map((m) => ({ m, v: avg(m) })).sort((a, b) => a.v - b.v)[0];
  if (!low || low.v >= MUSCLE_FLOOR / 2) return null;
  const sets1 = Math.round(low.v);
  return {
    kind: 'balance',
    headline: `${label(low.m)} gets ${sets1} sets a week`,
    metric: `${label(low.m)} ${sets1} sets/wk (aim ${MUSCLE_FLOOR})`,
    question: `Am I training ${low.m.replace('_', ' ')} enough?`,
  };
}

function rhythmInsight(starts: number[], now: number): Insight | null {
  const last = Math.max(...starts);
  const days = Math.floor((now - last) / DAY);
  if (days >= BREAK_DAYS) {
    return {
      kind: 'break',
      headline: `${days} days since your last workout`,
      metric: `Last session ${days} days ago`,
      question: 'How should I ease back in after a break?',
    };
  }
  const week = starts.filter((t) => now - t < 7 * DAY).length;
  if (week >= 3) {
    return {
      kind: 'streak',
      headline: `${week} sessions in the last 7 days`,
      metric: `${week} sessions this week`,
      question: 'How is my week going?',
    };
  }
  return null;
}

export function buildAskBrief(sets: readonly NormSet[], unit: Unit, now = Date.now()): AskBrief {
  const starts = new Map<string, number>();
  for (const s of sets) starts.set(s.logId, Date.parse(s.startedAt));
  const sessions = starts.size;
  if (sessions < MIN_SESSIONS) {
    return {
      headline: 'Ask about your training',
      scene: 'fresh',
      cards: [],
      sessions,
    };
  }
  const all = [...liftInsights(sets, unit, now), balanceInsight(sets, now), rhythmInsight([...starts.values()], now)].filter(
    (i): i is Insight => i !== null,
  );
  // Stable priority order; within a kind, the order the rule produced.
  all.sort((a, b) => PRIORITY.indexOf(a.kind) - PRIORITY.indexOf(b.kind));
  // One card per question, so two lifts can't produce the same tap.
  const seen = new Set<string>();
  const cards = all.filter((i) => !seen.has(i.question) && seen.add(i.question)).slice(0, 3);
  const top = cards[0];
  return top
    ? { headline: top.headline, scene: SCENE[top.kind], cards, sessions }
    : {
        headline: 'Ask about your training',
        scene: 'mark',
        cards: [],
        sessions,
      };
}

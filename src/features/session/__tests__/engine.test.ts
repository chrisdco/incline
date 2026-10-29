/**
 * Session engine logic against in-memory fakes: no RN, no SQLite. The real
 * query functions are covered by db/__tests__/session-flows.integration.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSessionEngine, UNDO_LIMIT, volatileKey, type SessionEngineDeps } from '../engine';

import type { SessionSet, SessionWorkout, SetPatch } from '@/db/queries';

function set(id: number, exerciseId: number, extra: Partial<SessionSet> = {}): SessionSet {
  return {
    id,
    workoutLogId: 1,
    exerciseId,
    setIndex: 0,
    weight: 50,
    reps: 8,
    completed: false,
    restSeconds: null,
    supersetGroup: null,
    setType: 'working',
    rpe: null,
    createdAt: 0,
    exerciseName: `Ex ${exerciseId}`,
    primaryMuscle: 'chest',
    ...extra,
  };
}

function workout(id: number, sets: SessionSet[], extra: Partial<SessionWorkout> = {}): SessionWorkout {
  return {
    id,
    templateId: null,
    name: `Log ${id}`,
    startedAt: 1_000 * id,
    endedAt: null,
    durationSeconds: 0,
    totalVolume: 0,
    unit: 'metric',
    notes: '',
    isComplete: false,
    sets,
    ...extra,
  } as SessionWorkout;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function harness(logs: Record<number, SessionWorkout>, opts: { rest?: Record<number, Record<number, number>> } = {}) {
  const kv = new Map<string, string>();
  const calls: string[] = [];
  let clock = 10_000;
  const deps: SessionEngineDeps = {
    getWorkoutLog: vi.fn(async (id: number) => (logs[id] ? structuredClone(logs[id]) : null)),
    getRestDefaultsForSession: vi.fn(async (id: number) => opts.rest?.[id] ?? {}),
    getLastSetsForExercises: vi.fn(async (ids: number[]) =>
      Object.fromEntries(ids.map((x) => [x, [set(900 + x, x, { weight: 40 })]])),
    ),
    getExercisePRSummaries: vi.fn(async () => ({})),
    getTemplateSuggestions: vi.fn(async () => []),
    getSessionGhost: vi.fn(async () => null),
    updateSet: vi.fn(async (setId: number, patch: SetPatch) => {
      calls.push(`update:${setId}:${JSON.stringify(patch)}`);
    }),
    addSet: vi.fn(async () => 1),
    addWarmUpSet: vi.fn(async () => 1),
    removeSet: vi.fn(async (setId: number) => {
      calls.push(`remove:${setId}`);
    }),
    restoreSet: vi.fn(async (setId: number) => {
      calls.push(`restore:${setId}`);
    }),
    removeExerciseFromWorkout: vi.fn(async (_log: number, exerciseId: number) => {
      const ids = Object.values(logs).flatMap((l) => l.sets.filter((s) => s.exerciseId === exerciseId).map((s) => s.id));
      return { removed: ids.length, setIds: ids };
    }),
    updateWorkoutNotes: vi.fn(async () => {}),
    // The real ones drop the volatile kv entry inside their transaction.
    finishWorkout: vi.fn(async (logId: number) => {
      kv.delete(volatileKey(logId));
    }),
    discardWorkout: vi.fn(async (logId: number) => {
      kv.delete(volatileKey(logId));
    }),
    kvGet: async (k) => kv.get(k) ?? null,
    kvSet: async (k, v) => {
      kv.set(k, v);
    },
    settings: () => ({ unit: 'metric', showSessionGhost: false, autoStartRest: true, defaultRestSeconds: 90 }),
    now: () => clock,
    notesDebounceMs: 0,
  };
  const ui = { toast: vi.fn(), startRest: vi.fn(), stopRest: vi.fn(), celebrate: vi.fn() };
  const engine = createSessionEngine(deps);
  engine.bindUi(ui);
  return {
    engine,
    deps,
    ui,
    kv,
    calls,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

describe('session engine: open + rest seeding', () => {
  it('seeds rest defaults for every session it opens (#168)', async () => {
    const h = harness(
      { 1: workout(1, [set(1, 10)]), 2: workout(2, [set(2, 20)]) },
      { rest: { 1: { 10: 120 }, 2: { 20: 75 } } },
    );
    await h.engine.open(1);
    expect(h.engine.store.getState().restSeconds).toEqual({ 10: 120 });
    await h.engine.open(2);
    expect(h.engine.store.getState().restSeconds).toEqual({ 20: 75 });
  });

  it('restores edited rest over defaults after relaunch (#156)', async () => {
    const logs = { 1: workout(1, [set(1, 10)]) };
    const a = harness(logs, { rest: { 1: { 10: 120 } } });
    await a.engine.open(1);
    a.engine.setRest(10, 45);
    await tick();
    // A fresh engine = a killed and relaunched app, same kv table.
    const b = harness(logs, { rest: { 1: { 10: 120 } } });
    for (const [k, v] of a.kv) b.kv.set(k, v);
    await b.engine.open(1);
    expect(b.engine.store.getState().restSeconds).toEqual({ 10: 45 });
  });

  it('ignores a volatile payload written for a different log with the same id', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    h.kv.set(volatileKey(1), JSON.stringify({ startedAt: 999, pausedAt: 5, totalPausedMs: 9, restSeconds: { 10: 1 }, notesDraft: 'x' }));
    await h.engine.open(1);
    const s = h.engine.store.getState();
    expect(s.pausedAt).toBeNull();
    expect(s.notesDraft).toBe('');
  });
});

describe('session engine: pause (#171)', () => {
  it('banks paused ms and survives relaunch while paused', async () => {
    const logs = { 1: workout(1, [set(1, 10)]) };
    const a = harness(logs);
    await a.engine.open(1);
    a.engine.pause();
    a.advance(30_000);
    a.engine.resume();
    a.engine.pause();
    await tick();

    const b = harness(logs);
    for (const [k, v] of a.kv) b.kv.set(k, v);
    await b.engine.open(1);
    const s = b.engine.store.getState();
    expect(s.totalPausedMs).toBe(30_000);
    expect(s.pausedAt).not.toBeNull();
  });

  it('finish passes accumulated + in-progress pause to finishWorkout', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    h.engine.pause();
    h.advance(10_000);
    h.engine.resume();
    h.engine.pause();
    h.advance(5_000);
    await h.engine.finish();
    expect(h.deps.finishWorkout).toHaveBeenCalledWith(1, { pausedMs: 15_000 });
  });
});

describe('session engine: notes draft (#170)', () => {
  it('persists the draft to kv and commits it to the log', async () => {
    const logs = { 1: workout(1, [set(1, 10)]) };
    const h = harness(logs);
    await h.engine.open(1);
    h.engine.setNotesDraft('felt strong');
    await tick();
    expect(JSON.parse(h.kv.get(volatileKey(1))!).notesDraft).toBe('felt strong');
    await h.engine.commitNotes();
    expect(h.deps.updateWorkoutNotes).toHaveBeenCalledWith(1, 'felt strong');

    const b = harness(logs);
    for (const [k, v] of h.kv) b.kv.set(k, v);
    await b.engine.open(1);
    expect(b.engine.store.getState().notesDraft).toBe('felt strong');
  });
});

describe('session engine: finish is one write (#141)', () => {
  it('hands the notes draft to finishWorkout instead of a separate notes write', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    h.engine.setNotesDraft('  felt strong ');
    expect(await h.engine.finish()).toBe(true);
    expect(h.deps.updateWorkoutNotes).not.toHaveBeenCalled();
    expect(h.deps.finishWorkout).toHaveBeenCalledWith(1, { pausedMs: 0, notes: 'felt strong' });
  });

  it('a pending draft save cannot re-create the volatile entry after finish', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    h.engine.setNotesDraft('late');
    await h.engine.finish();
    await tick();
    expect(h.kv.has(volatileKey(1))).toBe(false);
  });
});

describe('session engine: per-set write order (#164)', () => {
  it('serializes rapid toggles so the last tap lands last', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    await h.engine.open(1);
    let release!: () => void;
    const slow = new Promise<void>((r) => {
      release = r;
    });
    const order: boolean[] = [];
    (h.deps.updateSet as ReturnType<typeof vi.fn>).mockImplementation(async (_id: number, p: SetPatch) => {
      if (order.length === 0) await slow;
      order.push(p.completed!);
    });
    h.engine.toggleComplete(1);
    h.engine.toggleComplete(1);
    h.engine.toggleComplete(1);
    expect(h.engine.store.getState().session?.sets[0].completed).toBe(true);
    release();
    await h.engine.flushWrites();
    expect(order).toEqual([true, false, true]);
  });

  it('a delete waits for that set’s pending edit', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    await h.engine.open(1);
    h.engine.changeWeight(1, 60);
    h.engine.removeSet(1);
    await h.engine.flushWrites();
    await tick();
    expect(h.calls).toEqual(['update:1:{"weight":60}', 'remove:1']);
  });
});

describe('session engine: undo stack (#167)', () => {
  it('keeps every removal undoable, each independently', async () => {
    const h = harness({ 1: workout(1, [set(1, 10), set(2, 10), set(3, 10)]) });
    await h.engine.open(1);
    h.engine.removeSet(1);
    h.engine.removeSet(2);
    await tick();
    await tick();
    const stack = h.engine.store.getState().undo;
    expect(stack.map((e) => e.setIds)).toEqual([[1], [2]]);
    // Undo the older one first: the newer entry is untouched.
    await h.engine.undo(stack[0].id);
    expect(h.calls).toContain('restore:1');
    expect(h.engine.store.getState().undo.map((e) => e.setIds)).toEqual([[2]]);
    await h.engine.undo();
    expect(h.calls).toContain('restore:2');
    expect(h.engine.store.getState().undo).toEqual([]);
  });

  it('offers undo through the toast action', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    await h.engine.open(1);
    h.engine.removeSet(1);
    await tick();
    await tick();
    const t = h.ui.toast.mock.calls.at(-1)![0];
    expect(t.title).toBe('Set removed');
    t.action.onPress();
    await tick();
    expect(h.calls).toContain('restore:1');
  });

  it('restores a removed exercise’s sets in order and caps the stack', async () => {
    const h = harness({ 1: workout(1, [set(1, 10), set(2, 10), set(3, 20)]) });
    await h.engine.open(1);
    await h.engine.removeExercise(10, 'Bench');
    await h.engine.undo();
    expect(h.calls.filter((c) => c.startsWith('restore'))).toEqual(['restore:1', 'restore:2']);
    for (let i = 0; i < UNDO_LIMIT + 3; i++) h.engine.pushUndo('set', 'x', [i]);
    expect(h.engine.store.getState().undo).toHaveLength(UNDO_LIMIT);
  });
});

describe('session engine: assist for new exercises (#157)', () => {
  it('fetches assist only for exercises added since open', async () => {
    const logs = { 1: workout(1, [set(1, 10)]) };
    const h = harness(logs);
    await h.engine.open(1);
    logs[1] = workout(1, [set(1, 10), set(2, 20)]);
    await h.engine.refresh();
    expect(h.deps.getLastSetsForExercises).toHaveBeenLastCalledWith([20]);
    expect(Object.keys(h.engine.store.getState().lastSets).map(Number).sort()).toEqual([10, 20]);
    await h.engine.refresh();
    expect(h.deps.getLastSetsForExercises).toHaveBeenCalledTimes(2);
  });

  it('seeds rest defaults for new exercises without clobbering edits', async () => {
    const logs = { 1: workout(1, [set(1, 10)]) };
    const rest = { 1: { 10: 120 } as Record<number, number> };
    const h = harness(logs, { rest });
    await h.engine.open(1);
    h.engine.setRest(10, 60);
    rest[1] = { 10: 120, 20: 90 };
    logs[1] = workout(1, [set(1, 10), set(2, 20)]);
    await h.engine.refresh();
    expect(h.engine.store.getState().restSeconds).toEqual({ 10: 60, 20: 90 });
  });
});

describe('session engine: finish / discard guards', () => {
  it('refuses to finish an empty workout and explains why (#172)', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    await h.engine.open(1);
    expect(await h.engine.finish()).toBe(false);
    expect(h.deps.finishWorkout).not.toHaveBeenCalled();
    expect(h.ui.toast.mock.calls.at(-1)![0].variant).toBe('warning');
  });

  it('double-tap finish closes the log once (#142)', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    const [a, b] = await Promise.all([h.engine.finish(), h.engine.finish()]);
    expect(a && b).toBe(true);
    expect(h.deps.finishWorkout).toHaveBeenCalledTimes(1);
    await expect(h.engine.discard()).resolves.toBe(true);
    expect(h.deps.discardWorkout).not.toHaveBeenCalled();
  });

  it('a failed finish can be retried', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    (h.deps.finishWorkout as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('busy'));
    expect(await h.engine.finish()).toBe(false);
    expect(h.engine.store.getState().finishing).toBe(false);
    expect(await h.engine.finish()).toBe(true);
  });

  it('finish clears the volatile kv entry', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    h.engine.pause();
    await tick();
    expect(h.kv.has(volatileKey(1))).toBe(true);
    await h.engine.finish();
    await tick();
    expect(h.kv.has(volatileKey(1))).toBe(false);
  });
});

describe('session engine: rest auto-start', () => {
  it('starts the exercise rest when a set completes', async () => {
    const h = harness({ 1: workout(1, [set(1, 10), set(2, 10)]) }, { rest: { 1: { 10: 100 } } });
    await h.engine.open(1);
    h.engine.toggleComplete(1);
    expect(h.ui.startRest).toHaveBeenCalledWith(100);
  });
});

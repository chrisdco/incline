/**
 * Session engine logic against in-memory fakes: no RN, no SQLite. The real
 * query functions are covered by db/__tests__/session-flows.integration.
 */
import { describe, expect, it, vi } from 'vitest';

import { createSessionEngine, UNDO_LIMIT, volatileKey, type SessionEngineDeps } from '../engine';

import type { SessionSet, SessionWorkout, SetPatch } from '@/db/queries';
import type { RoutineForSession } from '@/db/queries/routine-versions';

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

function harness(
  logs: Record<number, SessionWorkout>,
  opts: { rest?: Record<number, Record<number, number>>; routine?: RoutineForSession } = {},
) {
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
    routines: {
      get: vi.fn(async () => (opts.routine ? structuredClone(opts.routine) : null)),
      update: vi.fn(async (templateId: number) => ({ templateId, name: opts.routine?.name ?? 'Routine', versionId: 7 })),
      saveCopy: vi.fn(async () => ({ templateId: 99, name: 'Routine · 19 Nov', versionId: null })),
      restore: vi.fn(async () => true),
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

describe('session engine: typed reps survive Add set', () => {
  it('adds and reloads only after the pending reps write lands', async () => {
    const logs = { 1: workout(1, [set(1, 10, { reps: 0 })]) };
    const h = harness(logs);
    await h.engine.open(1);
    let release!: () => void;
    const slow = new Promise<void>((r) => {
      release = r;
    });
    (h.deps.updateSet as ReturnType<typeof vi.fn>).mockImplementation(async (id: number, p: SetPatch) => {
      await slow;
      const row = logs[1].sets.find((x) => x.id === id)!;
      Object.assign(row, p);
      h.calls.push('update');
    });
    (h.deps.addSet as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      h.calls.push('add');
      return 2;
    });
    h.engine.changeReps(1, 8);
    const adding = h.engine.addSet(10);
    await tick();
    expect(h.calls).toEqual([]);
    release();
    await adding;
    await tick();
    await tick();
    expect(h.calls).toEqual(['update', 'add']);
    expect(h.engine.store.getState().session?.sets[0].reps).toBe(8);
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

describe('session engine: assist read failures', () => {
  it('a failed prev/PR read is retried on the next refresh', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) });
    vi.mocked(h.deps.getLastSetsForExercises).mockRejectedValueOnce(new Error('database is locked'));
    await h.engine.open(1);
    expect(h.engine.store.getState().lastSets).toEqual({});

    await h.engine.refresh();
    expect(h.engine.store.getState().lastSets[10]?.[0]?.weight).toBe(40);
  });

  it('a failed rest-defaults read still opens the session, refresh fills it', async () => {
    const h = harness({ 1: workout(1, [set(1, 10)]) }, { rest: { 1: { 10: 120 } } });
    vi.mocked(h.deps.getRestDefaultsForSession).mockRejectedValueOnce(new Error('database is locked'));
    await h.engine.open(1);
    expect(h.engine.store.getState().session?.id).toBe(1);
    expect(h.engine.store.getState().restSeconds).toEqual({});

    await h.engine.refresh();
    expect(h.engine.store.getState().restSeconds).toEqual({ 10: 120 });
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

describe('session engine: apply suggestion to remaining sets', () => {
  it('fills unfinished working sets only and undo restores each set', async () => {
    const h = harness({
      1: workout(1, [
        set(1, 10, { setType: 'warmup', weight: 50, reps: 8 }),
        set(2, 10, { completed: true, weight: 100, reps: 5 }),
        set(3, 10, { weight: 100, reps: 5 }),
        set(4, 10, { weight: 102.5, reps: 4 }),
        set(5, 11, { weight: 60, reps: 10 }),
      ]),
    });
    await h.engine.open(1);
    const n = await h.engine.applyLoadToRemaining(10, 105, 5);
    expect(n).toBe(2);
    const byId = () => Object.fromEntries(h.engine.store.getState().session!.sets.map((s) => [s.id, [s.weight, s.reps]]));
    expect(byId()).toMatchObject({ 1: [50, 8], 2: [100, 5], 3: [105, 5], 4: [105, 5], 5: [60, 10] });

    const toast = h.ui.toast.mock.calls.at(-1)![0];
    expect(toast.title).toContain('2 sets');
    toast.action.onPress();
    await h.engine.flushWrites();
    expect(byId()).toMatchObject({ 3: [100, 5], 4: [102.5, 4] });
    expect(h.calls.filter((c) => c.startsWith('update:4'))).toEqual([
      'update:4:{"weight":105,"reps":5}',
      'update:4:{"weight":102.5,"reps":4}',
    ]);
  });

  it('does nothing when every working set is done', async () => {
    const h = harness({ 1: workout(1, [set(1, 10, { completed: true })]) });
    await h.engine.open(1);
    expect(await h.engine.applyLoadToRemaining(10, 105, 5)).toBe(0);
    expect(h.ui.toast).not.toHaveBeenCalled();
  });
});

describe('session engine: skip for today + routine changes at finish', () => {
  const routine: RoutineForSession = {
    templateId: 5,
    name: 'Push',
    estimatedMinutes: 45,
    slots: [
      { exerciseId: 10, name: 'Ex 10', sets: 2, restSeconds: 120 },
      { exerciseId: 20, name: 'Ex 20', sets: 1, restSeconds: 90 },
    ],
  };
  const fromRoutine = () =>
    workout(1, [set(1, 10, { completed: true }), set(2, 10), set(3, 20)], { templateId: 5 });

  it('keeps skipped exercises across a relaunch', async () => {
    const logs = { 1: fromRoutine() };
    const a = harness(logs, { routine });
    await a.engine.open(1);
    a.engine.skipExercise(20);
    await tick();
    const b = harness(logs, { routine });
    for (const [k, v] of a.kv) b.kv.set(k, v);
    await b.engine.open(1);
    expect(b.engine.store.getState().skipped).toEqual([20]);
    b.engine.unskipExercise(20);
    expect(b.engine.store.getState().skipped).toEqual([]);
  });

  it('saves a rest-only change to the routine without asking, with Undo', async () => {
    const h = harness({ 1: fromRoutine() }, { routine, rest: { 1: { 10: 120, 20: 90 } } });
    await h.engine.open(1);
    h.engine.setRest(10, 150);
    expect(await h.engine.finish()).toBe(true);
    expect(h.deps.routines.update).toHaveBeenCalledWith(
      5,
      [
        { exerciseId: 10, sets: 2, restSeconds: 150 },
        { exerciseId: 20, sets: 1, restSeconds: 90 },
      ],
      'workout-rest',
    );
    const toast = h.ui.toast.mock.calls.at(-1)?.[0];
    expect(toast.description).toBe('Rest times saved to Push.');
    toast.action.onPress();
    expect(h.deps.routines.restore).toHaveBeenCalledWith(7);
  });

  it('leaves the routine alone on keep, and a skipped exercise is never a change', async () => {
    const h = harness({ 1: fromRoutine() }, { routine, rest: { 1: { 10: 120, 20: 90 } } });
    await h.engine.open(1);
    h.engine.skipExercise(20);
    expect((await h.engine.routinePlan())?.diff.changes).toEqual([]);
    await h.engine.addSet(10);
    // addSet reloads rows from the fake; add the row to what the fake returns.
    h.engine.store.setState((s) => ({ session: s.session && { ...s.session, sets: [...s.session.sets, set(4, 10)] } }));
    expect((await h.engine.routinePlan())?.diff.structural).toBe(true);
    await h.engine.finish('keep');
    expect(h.deps.routines.update).not.toHaveBeenCalled();
    expect(h.deps.routines.saveCopy).not.toHaveBeenCalled();
  });

  it('still saves rest changes on keep, leaving sets and exercises as they were', async () => {
    const h = harness({ 1: fromRoutine() }, { routine, rest: { 1: { 10: 120, 20: 90 } } });
    await h.engine.open(1);
    h.engine.setRest(10, 180);
    h.engine.store.setState((s) => ({ session: s.session && { ...s.session, sets: [...s.session.sets, set(4, 10)] } }));
    expect((await h.engine.routinePlan())?.diff.structural).toBe(true);
    await h.engine.finish('keep');
    expect(h.deps.routines.update).toHaveBeenCalledWith(
      5,
      [
        { exerciseId: 10, sets: 2, restSeconds: 180 },
        { exerciseId: 20, sets: 1, restSeconds: 90 },
      ],
      'workout-rest',
    );
    expect(h.ui.toast.mock.calls.at(-1)?.[0].description).toBe('Push kept; rest times saved.');
  });

  it('saves a structural change as a copy when asked', async () => {
    const h = harness({ 1: fromRoutine() }, { routine, rest: { 1: { 10: 120, 20: 90 } } });
    await h.engine.open(1);
    h.engine.store.setState((s) => ({ session: s.session && { ...s.session, sets: s.session.sets.filter((x) => x.exerciseId !== 20) } }));
    await h.engine.finish('copy');
    expect(h.deps.routines.saveCopy).toHaveBeenCalledWith(1, 5, [{ exerciseId: 10, sets: 2, restSeconds: 120 }], 45);
  });
});

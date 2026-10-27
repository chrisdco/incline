import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  applySetToBests,
  bestsFromPrSummary,
  detectSetRecords,
  formatCelebrationKinds,
  isCelebrationPrKind,
} from '@/coaching/pr';
import { formatWeight } from '@/db/calc';
import { shouldStartRestAfterComplete } from '@/lib/superset-rest';

import type { ExercisePRSummary, SessionGhost, SessionSet, SessionWorkout, SetPatch } from '@/db/queries';
import type { TrainingSuggestion } from '@/coaching/types';
import type { SetEntry, SetType, Unit } from '@/db/types';
import { resolveWeightUnit } from '@/lib/units';

/**
 * Live-session engine: every piece of in-progress workout state, outside
 * React, behind one controller. The session screen only reads slices and
 * calls these methods; Track A's lock-screen rest / Live Activity reads the
 * same store. See TECH-DECISIONS §14.
 *
 * SQLite stays the source of truth for rows (writes go through the query
 * module's mutate() calls). The volatile bits that have no column — pause,
 * per-exercise rest, notes draft — persist to the kv table so a kill or
 * relaunch resumes them.
 */

export interface UndoEntry {
  id: number;
  kind: 'set' | 'exercise';
  /** Toast title, e.g. "Set removed" / "Bench Press removed". */
  label: string;
  /** Soft-deleted rows to restore, in original order. */
  setIds: number[];
}

export interface SessionEngineState {
  logId: number | null;
  session: SessionWorkout | null;
  loading: boolean;
  lastSets: Record<number, SetEntry[]>;
  prs: Record<number, ExercisePRSummary>;
  suggestions: Record<number, TrainingSuggestion>;
  ghost: SessionGhost | null;
  restSeconds: Record<number, number>;
  restKind: 'set' | 'superset';
  /** Epoch ms the clock was paused at; null while running. */
  pausedAt: number | null;
  /** Paused time already banked (excludes the current pause). */
  totalPausedMs: number;
  notesDraft: string;
  /** Newest last. Capped; each entry is undone independently. */
  undo: UndoEntry[];
  finishing: boolean;
  discarding: boolean;
}

/** What survives a kill: written to kv under `volatileKey(logId)`. */
export interface VolatileSessionState {
  /**
   * The log's started_at when written. Ids restart after an account wipe, so
   * a payload whose stamp doesn't match the open log belongs to another one.
   */
  startedAt: number;
  pausedAt: number | null;
  totalPausedMs: number;
  restSeconds: Record<number, number>;
  notesDraft: string;
}

export interface SessionEngineDeps {
  getWorkoutLog: (id: number) => Promise<SessionWorkout | null>;
  getRestDefaultsForSession: (logId: number) => Promise<Record<number, number>>;
  getLastSetsForExercises: (ids: number[]) => Promise<Record<number, SetEntry[]>>;
  getExercisePRSummaries: (ids: number[]) => Promise<Record<number, ExercisePRSummary>>;
  getTemplateSuggestions: (
    templateId: number,
    unit: Unit,
    unitOverrides?: Readonly<Record<string, Unit>>,
  ) => Promise<TrainingSuggestion[]>;
  getSessionGhost: (opts: {
    templateId: number | null;
    name: string | null;
    beforeStartedAt: number;
    excludeLogId: number;
  }) => Promise<SessionGhost | null>;
  updateSet: (setId: number, patch: SetPatch) => Promise<void>;
  addSet: (logId: number, exerciseId: number) => Promise<number>;
  addWarmUpSet: (logId: number, exerciseId: number) => Promise<number>;
  removeSet: (setId: number) => Promise<void>;
  restoreSet: (setId: number) => Promise<void>;
  removeExerciseFromWorkout: (
    logId: number,
    exerciseId: number,
  ) => Promise<{ removed: number; setIds: number[] }>;
  updateWorkoutNotes: (logId: number, notes: string) => Promise<void>;
  finishWorkout: (logId: number, options?: { pausedMs?: number }) => Promise<void>;
  discardWorkout: (logId: number) => Promise<void>;
  kvGet: (key: string) => Promise<string | null>;
  kvSet: (key: string, value: string) => Promise<void>;
  kvRemove: (key: string) => Promise<void>;
  settings: () => {
    unit: Unit;
    /** Per-exercise display units keyed by exerciseRefKey (§15). */
    exerciseWeightUnits: Readonly<Record<string, Unit>>;
    showSessionGhost: boolean;
    autoStartRest: boolean;
    defaultRestSeconds: number;
  };
  now?: () => number;
  /** Notes draft autosave delay; tests pass 0. */
  notesDebounceMs?: number;
}

/** UI side effects the screen binds while mounted (toast, rest, haptics). */
export interface SessionEngineUi {
  toast: (t: {
    title: string;
    description?: string;
    variant?: 'default' | 'success' | 'warning' | 'destructive' | 'info';
    durationMs?: number | null;
    action?: { label: string; onPress: () => void };
  }) => void;
  startRest: (seconds: number) => void;
  stopRest: () => void;
  celebrate: () => void;
}

export const UNDO_LIMIT = 10;
export const volatileKey = (logId: number) => `session:${logId}:volatile`;

const IDLE: SessionEngineState = {
  logId: null,
  session: null,
  loading: true,
  lastSets: {},
  prs: {},
  suggestions: {},
  ghost: null,
  restSeconds: {},
  restKind: 'set',
  pausedAt: null,
  totalPausedMs: 0,
  notesDraft: '',
  undo: [],
  finishing: false,
  discarding: false,
};

const NOOP_UI: SessionEngineUi = {
  toast: () => {},
  startRest: () => {},
  stopRest: () => {},
  celebrate: () => {},
};

export type FinishBlock = { reason: 'empty'; message: string } | null;

/** #172: nothing completed means nothing to save. */
export function finishBlock(session: SessionWorkout | null): FinishBlock {
  if (!session || session.sets.some((s) => s.completed)) return null;
  return {
    reason: 'empty',
    message: 'Complete at least one set to save this workout, or discard it instead.',
  };
}

/** Paused ms up to `now`, including a pause still in progress. */
export function pausedMsAt(state: Pick<SessionEngineState, 'pausedAt' | 'totalPausedMs'>, now: number): number {
  return state.totalPausedMs + (state.pausedAt != null ? Math.max(0, now - state.pausedAt) : 0);
}

function parseVolatile(raw: string | null, startedAt: number | undefined): VolatileSessionState | null {
  if (!raw || startedAt == null) return null;
  try {
    const v = JSON.parse(raw) as Partial<VolatileSessionState>;
    if (v.startedAt !== startedAt) return null;
    return {
      startedAt,
      pausedAt: typeof v.pausedAt === 'number' ? v.pausedAt : null,
      totalPausedMs: typeof v.totalPausedMs === 'number' ? v.totalPausedMs : 0,
      restSeconds: v.restSeconds && typeof v.restSeconds === 'object' ? v.restSeconds : {},
      notesDraft: typeof v.notesDraft === 'string' ? v.notesDraft : '',
    };
  } catch {
    return null;
  }
}

function mapSets(
  session: SessionWorkout | null,
  fn: (s: SessionSet) => SessionSet,
  setId: number,
): SessionWorkout | null {
  if (!session) return session;
  return { ...session, sets: session.sets.map((s) => (s.id === setId ? fn(s) : s)) };
}

export function createSessionEngine(deps: SessionEngineDeps) {
  const now = deps.now ?? Date.now;
  const notesDebounceMs = deps.notesDebounceMs ?? 400;
  const store: StoreApi<SessionEngineState> = createStore<SessionEngineState>(() => ({ ...IDLE }));
  let ui: SessionEngineUi = NOOP_UI;
  /** Assist run guard: a newer full assist load drops older responses. */
  let assistRun = 0;
  /** Exercise ids assist has been fetched for (this log). */
  let assistKnown = new Set<number>();
  /** #164: one promise chain per set so writes land in tap order. */
  const setQueues = new Map<number, Promise<void>>();
  let undoSeq = 0;
  let notesTimer: ReturnType<typeof setTimeout> | null = null;
  /** Bumps on every open(); async work for an older open is dropped. */
  let generation = 0;
  /** #142: synchronous guard — a second tap lands before React re-renders. */
  let terminal: Promise<boolean> | null = null;

  const get = store.getState;
  const set = store.setState;
  const isCurrent = (gen: number, logId: number) => gen === generation && get().logId === logId;

  function volatile(): VolatileSessionState {
    const s = get();
    return {
      startedAt: s.session?.startedAt ?? 0,
      pausedAt: s.pausedAt,
      totalPausedMs: s.totalPausedMs,
      restSeconds: s.restSeconds,
      notesDraft: s.notesDraft,
    };
  }

  /** Fire-and-forget: kv is the persistence of last resort, never blocks UI. */
  function persistVolatile(): Promise<void> {
    const { logId, session } = get();
    if (logId == null || session == null) return Promise.resolve();
    return deps.kvSet(volatileKey(logId), JSON.stringify(volatile())).catch(() => {});
  }

  /** Rest defaults fill exercises that have no explicit (edited/restored) value. */
  function mergeRestDefaults(defaults: Record<number, number>) {
    const cur = get().restSeconds;
    const next = { ...cur };
    let changed = false;
    for (const [key, value] of Object.entries(defaults)) {
      const id = Number(key);
      if (next[id] === undefined) {
        next[id] = value;
        changed = true;
      }
    }
    if (changed) set({ restSeconds: next });
  }

  function unitFor(refKey: string | null | undefined): Unit {
    const { unit, exerciseWeightUnits } = deps.settings();
    return resolveWeightUnit(exerciseWeightUnits, refKey, unit);
  }

  async function loadAssistFull(gen: number, s: SessionWorkout): Promise<void> {
    const run = (assistRun += 1);
    const { unit, exerciseWeightUnits, showSessionGhost } = deps.settings();
    const ids = [...new Set(s.sets.map((x) => x.exerciseId))];
    for (const id of ids) assistKnown.add(id);
    const [lastMap, prMap, sug, ghost] = await Promise.all([
      deps.getLastSetsForExercises(ids),
      deps.getExercisePRSummaries(ids),
      s.templateId ? deps.getTemplateSuggestions(s.templateId, unit, exerciseWeightUnits) : Promise.resolve([]),
      showSessionGhost
        ? deps.getSessionGhost({
            templateId: s.templateId,
            name: s.templateId ? null : s.name,
            beforeStartedAt: s.startedAt,
            excludeLogId: s.id,
          })
        : Promise.resolve(null),
    ]);
    if (run !== assistRun || !isCurrent(gen, s.id)) return;
    set({
      lastSets: lastMap,
      prs: prMap,
      suggestions: Object.fromEntries(sug.map((x) => [x.exerciseId, x])),
      ghost,
    });
  }

  /** #157: fetch assist only for exercises it has never seen, then merge. */
  async function loadAssistFor(gen: number, logId: number, ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    for (const id of ids) assistKnown.add(id);
    const [lastMap, prMap] = await Promise.all([
      deps.getLastSetsForExercises(ids),
      deps.getExercisePRSummaries(ids),
    ]);
    if (!isCurrent(gen, logId)) return;
    set((s) => ({ lastSets: { ...s.lastSets, ...lastMap }, prs: { ...s.prs, ...prMap } }));
  }

  async function loadRows(gen: number, logId: number): Promise<SessionWorkout | null> {
    const s = await deps.getWorkoutLog(logId);
    if (!isCurrent(gen, logId)) return null;
    set({ session: s, loading: false });
    return s;
  }

  function reloadRows() {
    const { logId } = get();
    if (logId == null) return;
    void loadRows(generation, logId);
  }

  const engine = {
    store,

    bindUi(next: SessionEngineUi): () => void {
      ui = next;
      return () => {
        if (ui === next) ui = NOOP_UI;
      };
    },

    /**
     * Mount a session. Same id = keep state (reopen renders instantly, then
     * refresh); a different id resets everything, including rest seeding
     * (#168) — nothing is keyed to "first session only".
     */
    async open(logId: number, cached?: SessionWorkout | null): Promise<void> {
      if (get().logId === logId) {
        await engine.refresh();
        return;
      }
      generation += 1;
      const gen = generation;
      assistRun += 1;
      assistKnown = new Set();
      setQueues.clear();
      terminal = null;
      if (notesTimer) clearTimeout(notesTimer);
      notesTimer = null;
      set({ ...IDLE, logId, session: cached ?? null, loading: cached == null });

      const [s, rawVolatile, defaults] = await Promise.all([
        deps.getWorkoutLog(logId),
        deps.kvGet(volatileKey(logId)).catch(() => null),
        deps.getRestDefaultsForSession(logId),
      ]);
      if (!isCurrent(gen, logId)) return;
      const saved = parseVolatile(rawVolatile, s?.startedAt);
      set({
        session: s,
        loading: false,
        pausedAt: saved?.pausedAt ?? null,
        totalPausedMs: saved?.totalPausedMs ?? 0,
        restSeconds: saved?.restSeconds ?? {},
        // A saved draft beats the committed notes: it is newer by definition.
        notesDraft: saved?.notesDraft ?? s?.notes ?? '',
      });
      mergeRestDefaults(defaults);
      if (s) await loadAssistFull(gen, s);
    },

    /** Focus return (pick/reorder screens wrote directly): rows + new-id assist + rest. */
    async refresh(): Promise<void> {
      const { logId } = get();
      if (logId == null) return;
      const gen = generation;
      const [s, defaults] = await Promise.all([
        loadRows(gen, logId),
        deps.getRestDefaultsForSession(logId),
      ]);
      if (!isCurrent(gen, logId)) return;
      mergeRestDefaults(defaults);
      if (!s) return;
      const unseen = [...new Set(s.sets.map((x) => x.exerciseId))].filter((id) => !assistKnown.has(id));
      await loadAssistFor(gen, logId, unseen);
    },

    /** #164: serialize writes per set; failure toasts and reloads truth. */
    writeSet(setId: number, patch: SetPatch, failTitle: string): Promise<void> {
      const prev = setQueues.get(setId) ?? Promise.resolve();
      const next = prev.then(() =>
        deps.updateSet(setId, patch).catch(() => {
          ui.toast({ title: failTitle, variant: 'destructive' });
          reloadRows();
        }),
      );
      setQueues.set(setId, next);
      void next.then(() => {
        if (setQueues.get(setId) === next) setQueues.delete(setId);
      });
      return next;
    },

    /** Resolves once every queued set write has settled (tests, finish). */
    async flushWrites(): Promise<void> {
      await Promise.all([...setQueues.values()]);
    },

    patchSet(setId: number, patch: Partial<SessionSet>) {
      set((s) => ({ session: mapSets(s.session, (x) => ({ ...x, ...patch }), setId) }));
    },

    changeWeight(setId: number, weight: number) {
      engine.patchSet(setId, { weight });
      void engine.writeSet(setId, { weight }, 'Could not save weight');
    },
    changeReps(setId: number, reps: number) {
      engine.patchSet(setId, { reps });
      void engine.writeSet(setId, { reps }, 'Could not save reps');
    },
    changeRpe(setId: number, rpe: number | null) {
      engine.patchSet(setId, { rpe });
      void engine.writeSet(setId, { rpe }, 'Could not save RPE');
    },
    changeSetType(setId: number, setType: SetType) {
      engine.patchSet(setId, { setType });
      void engine.writeSet(setId, { setType }, 'Could not save set type');
    },

    toggleComplete(setId: number) {
      const { session, restSeconds, prs } = get();
      const target = session?.sets.find((x) => x.id === setId);
      if (!session || !target) return;
      const next = !target.completed;
      const restSec = next ? (restSeconds[target.exerciseId] ?? 0) : null;
      engine.patchSet(setId, { completed: next, restSeconds: restSec });
      void engine.writeSet(setId, { completed: next, restSeconds: restSec }, 'Could not save set');
      if (!next) return;

      // Celebrate only a genuine record against prior history.
      const pr = prs[target.exerciseId];
      if (pr && (pr.heaviestWeight > 0 || pr.best1RM > 0)) {
        const prior = bestsFromPrSummary(pr);
        const entry = {
          exerciseId: target.exerciseId,
          weight: target.weight,
          reps: target.reps,
          completed: true,
          setType: target.setType,
          createdAt: now(),
        };
        const kinds = detectSetRecords(entry, prior, { requirePriorHistory: true }).filter(isCelebrationPrKind);
        if (kinds.length > 0) {
          const bests = applySetToBests(prior, entry);
          set((s) => ({
            prs: {
              ...s.prs,
              [target.exerciseId]: {
                ...pr,
                heaviestWeight: bests.heaviestWeight,
                best1RM: bests.estimated1RM,
                bestSetVolume: Math.max(pr.bestSetVolume, bests.bestSetVolume),
              },
            },
          }));
          ui.celebrate();
          ui.toast({
            title: 'New PR!',
            description: `${target.exerciseName} · ${formatWeight(target.weight, unitFor(target.exerciseRefKey))} × ${target.reps} · ${formatCelebrationKinds(kinds, target.reps)}`,
            variant: 'success',
          });
        }
      }

      const { autoStartRest, defaultRestSeconds } = deps.settings();
      if (!autoStartRest) return;
      const nextSets = session.sets.map((s) => (s.id === setId ? { ...s, completed: true } : s));
      const decision = shouldStartRestAfterComplete(nextSets, setId);
      if (!decision.start) return;
      const exRest = restSeconds[target.exerciseId] ?? defaultRestSeconds;
      if (exRest <= 0) return;
      set({ restKind: decision.kind });
      // Silent replace, like Strong/Hevy: the timer bar shows the restart.
      ui.startRest(exRest);
    },

    async applyLoad(exerciseId: number, weight: number, reps?: number): Promise<void> {
      const groupSets = get().session?.sets.filter((s) => s.exerciseId === exerciseId) ?? [];
      const target = groupSets.find((s) => !s.completed) ?? groupSets.at(-1);
      if (!target) return;
      const patch = reps != null && reps > 0 ? { weight, reps } : { weight };
      engine.patchSet(target.id, patch);
      await engine.writeSet(target.id, patch, 'Could not apply load');
    },

    setRest(exerciseId: number, seconds: number) {
      set((s) => ({ restSeconds: { ...s.restSeconds, [exerciseId]: seconds } }));
      void persistVolatile();
    },

    setRestForAll(seconds: number) {
      const map: Record<number, number> = {};
      for (const s of get().session?.sets ?? []) map[s.exerciseId] = seconds;
      set({ restSeconds: map });
      void persistVolatile();
    },

    async addSet(exerciseId: number): Promise<void> {
      const { logId } = get();
      if (logId == null) return;
      await deps.addSet(logId, exerciseId).then(reloadRows, () => {
        ui.toast({ title: 'Could not add set', variant: 'destructive' });
      });
    },

    async addWarmUp(exerciseId: number): Promise<void> {
      const { logId } = get();
      if (logId == null) return;
      await deps.addWarmUpSet(logId, exerciseId).then(reloadRows, () => {
        ui.toast({ title: 'Could not add warm-up', variant: 'destructive' });
      });
    },

    pushUndo(kind: UndoEntry['kind'], label: string, setIds: number[]): UndoEntry {
      const entry: UndoEntry = { id: (undoSeq += 1), kind, label, setIds };
      set((s) => ({ undo: [...s.undo, entry].slice(-UNDO_LIMIT) }));
      return entry;
    },

    /** #167: every removal gets its own entry; Undo restores that one. */
    async undo(entryId?: number): Promise<boolean> {
      const stack = get().undo;
      const entry = entryId == null ? stack.at(-1) : stack.find((e) => e.id === entryId);
      if (!entry) return false;
      set((s) => ({ undo: s.undo.filter((e) => e.id !== entry.id) }));
      const ok = await entry.setIds
        .reduce<Promise<void>>((p, id) => p.then(() => deps.restoreSet(id)), Promise.resolve())
        .then(
          () => true,
          () => false,
        );
      const { logId } = get();
      if (logId != null) {
        const s = await loadRows(generation, logId);
        if (s && entry.kind === 'exercise') {
          const ids = [...new Set(s.sets.map((x) => x.exerciseId))].filter((id) => !assistKnown.has(id));
          void loadAssistFor(generation, logId, ids);
        }
      }
      if (!ok) ui.toast({ title: 'Could not undo', variant: 'destructive' });
      else if (entry.kind === 'exercise') ui.toast({ title: entry.label.replace(/ removed$/, ' restored'), variant: 'success' });
      return ok;
    },

    removeSet(setId: number) {
      const target = get().session?.sets.find((s) => s.id === setId);
      if (!target) return;
      set((s) => (s.session ? { session: { ...s.session, sets: s.session.sets.filter((x) => x.id !== setId) } } : {}));
      // Wait for any in-flight edit on this set so the delete lands last.
      const prev = setQueues.get(setId) ?? Promise.resolve();
      void prev
        .then(() => deps.removeSet(setId))
        .then(
          () => {
            const entry = engine.pushUndo('set', 'Set removed', [setId]);
            ui.toast({
              title: 'Set removed',
              variant: 'info',
              durationMs: 5000,
              action: { label: 'Undo', onPress: () => void engine.undo(entry.id) },
            });
          },
          () => {
            ui.toast({ title: 'Could not delete set', variant: 'destructive' });
            reloadRows();
          },
        );
    },

    async removeExercise(exerciseId: number, name: string): Promise<void> {
      const { logId } = get();
      if (logId == null) return;
      await deps.removeExerciseFromWorkout(logId, exerciseId).then(
        ({ removed, setIds }) => {
          reloadRows();
          const label = `${name} removed`;
          const entry = engine.pushUndo('exercise', label, setIds);
          ui.toast({
            title: label,
            description:
              removed > 0
                ? `${removed} set${removed === 1 ? '' : 's'} left this session. Your routine is untouched.`
                : undefined,
            variant: 'info',
            durationMs: 6000,
            action: { label: 'Undo', onPress: () => void engine.undo(entry.id) },
          });
        },
        () => {
          ui.toast({ title: 'Could not remove exercise', variant: 'destructive' });
        },
      );
    },

    pause() {
      if (get().pausedAt != null) return;
      set({ pausedAt: now() });
      void persistVolatile();
    },

    resume() {
      const { pausedAt, totalPausedMs } = get();
      if (pausedAt == null) return;
      set({ pausedAt: null, totalPausedMs: totalPausedMs + Math.max(0, now() - pausedAt) });
      void persistVolatile();
    },

    /** #170: draft persists (debounced) so navigate-away / kill keeps it. */
    setNotesDraft(text: string) {
      set({ notesDraft: text });
      if (notesTimer) clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        notesTimer = null;
        void persistVolatile();
      }, notesDebounceMs);
    },

    /** Blur / collapse / unmount: commit the draft to the log row. */
    async commitNotes(): Promise<void> {
      const { logId, session, notesDraft } = get();
      if (logId == null || !session) return;
      if (notesTimer) clearTimeout(notesTimer);
      notesTimer = null;
      await persistVolatile();
      if (notesDraft === (session.notes ?? '')) return;
      await deps.updateWorkoutNotes(logId, notesDraft).then(
        () => set((s) => (s.session ? { session: { ...s.session, notes: notesDraft } } : {})),
        () => {},
      );
    },

    /**
     * Finish. Returns true when the log closed. Guarded (#142) and refuses an
     * empty workout (#172). Idempotent while in flight: a second call joins.
     */
    finish(): Promise<boolean> {
      if (terminal) return terminal;
      const state = get();
      const { logId } = state;
      if (logId == null || state.session == null) return Promise.resolve(false);
      const block = finishBlock(state.session);
      if (block) {
        ui.toast({ title: 'Nothing to save yet', description: block.message, variant: 'warning' });
        return Promise.resolve(false);
      }
      set({ finishing: true });
      ui.stopRest();
      const pausedMs = pausedMsAt(state, now());
      const notes = state.notesDraft.trim();
      const run = engine
        .flushWrites()
        .then(() => (notes ? deps.updateWorkoutNotes(logId, notes) : undefined))
        .then(() => deps.finishWorkout(logId, { pausedMs }))
        .then(
          () => {
            void deps.kvRemove(volatileKey(logId)).catch(() => {});
            set({ undo: [] });
            ui.toast({ title: 'Workout saved', variant: 'success' });
            return true;
          },
          () => {
            terminal = null;
            set({ finishing: false });
            ui.toast({ title: 'Could not save workout', description: 'Please try again.', variant: 'destructive' });
            return false;
          },
        );
      terminal = run;
      return run;
    },

    discard(): Promise<boolean> {
      if (terminal) return terminal;
      const { logId } = get();
      if (logId == null) return Promise.resolve(false);
      set({ discarding: true });
      ui.stopRest();
      const run = engine
        .flushWrites()
        .then(() => deps.discardWorkout(logId))
        .then(
          () => {
            void deps.kvRemove(volatileKey(logId)).catch(() => {});
            set({ undo: [] });
            return true;
          },
          () => {
            terminal = null;
            set({ discarding: false });
            ui.toast({ title: 'Could not discard workout', variant: 'destructive' });
            return false;
          },
        );
      terminal = run;
      return run;
    },
  };
  return engine;
}

export type SessionEngine = ReturnType<typeof createSessionEngine>;

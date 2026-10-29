/**
 * kv key for a live session's volatile state (pause, per-exercise rest,
 * notes draft — see VolatileSessionState in features/session/engine.ts).
 * Pure so both the engine and the finish/discard transactions that delete it
 * can share it without pulling SQLite into engine tests.
 */
export const volatileKey = (logId: number) => `session:${logId}:volatile`;

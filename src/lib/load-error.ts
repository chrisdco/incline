/**
 * Why a screen could not show its record, in words the user can act on.
 *
 * Reads are local SQLite, so "not found" has three honest causes that used to
 * share one "X not found" screen:
 * - `syncing`: the first pull hasn't landed this row yet (opening a routine
 *   right after sign-in). It resolves by itself when the table-change event
 *   refetches the screen.
 * - `missing`: sync is done and the row is gone (deleted, here or elsewhere).
 * - a read error, split by what the user can do about it (below).
 */
export type LoadProblem = 'syncing' | 'missing' | 'busy' | 'storage' | 'update' | 'unknown';

const BUSY = /SQLITE_BUSY|database is locked|SQLITE_LOCKED/i;
const STORAGE = /SQLITE_FULL|disk I\/O|database or disk is full|SQLITE_IOERR|SQLITE_CORRUPT|malformed/i;
const UPDATE = /no such (table|column)|SQLITE_SCHEMA/i;

export function classifyReadError(error: unknown): Exclude<LoadProblem, 'syncing' | 'missing'> {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (BUSY.test(message)) return 'busy';
  if (STORAGE.test(message)) return 'storage';
  if (UPDATE.test(message)) return 'update';
  return 'unknown';
}

/** A busy database clears on its own (a sync write is finishing): worth a quiet retry. */
export function isTransientReadError(error: unknown): boolean {
  return classifyReadError(error) === 'busy';
}

export function loadProblemCopy(problem: LoadProblem, noun: string): { title: string; description: string } {
  const lower = noun.toLowerCase();
  switch (problem) {
    case 'syncing':
      return { title: `Still syncing this ${lower}`, description: 'It will appear here as soon as it arrives.' };
    case 'missing':
      return { title: `${noun} not found`, description: 'It may have been deleted, here or on another device.' };
    case 'busy':
      return { title: `Couldn’t open this ${lower} yet`, description: 'Your data was busy syncing. Try again in a moment.' };
    case 'storage':
      return { title: `Couldn’t read this ${lower}`, description: 'Your phone’s storage may be full. Free some space and try again.' };
    case 'update':
      return { title: `Couldn’t read this ${lower}`, description: 'This needs the latest version of the app. Restart it to update.' };
    default:
      return { title: `Couldn’t open this ${lower}`, description: 'Something went wrong reading it. Please try again.' };
  }
}

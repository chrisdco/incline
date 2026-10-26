/**
 * Table-change event: the one place readers (widgets, query caches) learn that
 * SQLite moved under them. Two sources feed it:
 *
 * - `mutate()` emits its declared tables after COMMIT, so a subscriber that
 *   re-reads always sees the committed rows.
 * - expo-sqlite's update hook (`enableChangeListener`) covers writes that do
 *   not go through `mutate()` yet (sync pull, seeding, legacy query modules).
 *   The hook fires per row and before commit, so events are coalesced per
 *   tick; a read it triggers may see the pre-commit state, which is fine
 *   because every `mutate()` commit emits again afterwards.
 *
 * Subscribers get a set of table names, never row ids — invalidation is by
 * table, and a burst of thousands of row events collapses into one call.
 */
export type TableChangeListener = (tables: ReadonlySet<string>) => void;

const listeners = new Set<TableChangeListener>();
let pending: Set<string> | null = null;

/** Subscribe to coalesced table changes. Returns the unsubscribe function. */
export function onTablesChanged(listener: TableChangeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Queue tables as changed; listeners run once per tick with the union. */
export function emitTablesChanged(tables: Iterable<string>): void {
  const first = pending === null;
  pending ??= new Set();
  for (const t of tables) pending.add(t);
  if (!first) return;
  setTimeout(flush, 0);
}

function flush(): void {
  const tables = pending;
  pending = null;
  if (!tables || tables.size === 0) return;
  for (const listener of [...listeners]) {
    try {
      listener(tables);
    } catch (err) {
      console.warn('[db] table-change listener failed', err);
    }
  }
}

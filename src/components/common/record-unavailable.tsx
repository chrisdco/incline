import { useDbQuery } from '@/hooks/use-data';
import type { DbTable } from '@/db/write';
import { getSyncStatus } from '@/sync';
import { classifyReadError, loadProblemCopy, type LoadProblem } from '@/lib/load-error';
import { ErrorState } from './states';

/**
 * The "can't show this record" screen for detail routes. Tells a row the
 * first sync hasn't pulled yet apart from a deleted one and from a failed
 * read (see `src/lib/load-error.ts`), instead of one "X not found" for all.
 *
 * `tables` are the record's own tables: when sync lands the row, the change
 * event refetches both this status read and the screen's own query.
 */
export function RecordUnavailable({
  noun,
  error,
  tables,
  onRetry,
}: {
  noun: string;
  error: unknown;
  tables: readonly DbTable[];
  onRetry?: () => void;
}) {
  const status = useDbQuery(tables, ['syncPending'], async () => {
    const s = await getSyncStatus();
    return s.status === 'syncing' || s.lastPullAt == null;
  });
  const problem: LoadProblem = error
    ? classifyReadError(error)
    : status.data
      ? 'syncing'
      : 'missing';
  const copy = loadProblemCopy(problem, noun);
  return (
    <ErrorState
      title={copy.title}
      description={copy.description}
      onRetry={
        onRetry
          ? () => {
              void status.refetch();
              onRetry();
            }
          : undefined
      }
    />
  );
}

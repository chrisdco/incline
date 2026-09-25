import Link from "next/link";

import { getWorkouts } from "@/lib/queries";
import { formatDateTime, formatDuration, formatVolume } from "@/lib/format";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;

export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams;
  const page = Math.max(0, Number(params.page ?? 0) || 0);
  const { logs: visible, hasMore } = await getWorkouts(PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Workouts</h1>
      {visible.length === 0 ? (
        <EmptyState title="No workouts yet" description="Finished sessions sync here from the mobile app." />
      ) : (
        <div className="flex flex-col gap-3">
          {visible.map((log) => (
            <Link key={log.id} href={`/workouts/${log.id}`}>
              <Card className="transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{log.name}</p>
                    <p className="text-sm text-zinc-500">{formatDateTime(log.started_at)}</p>
                    {log.notes ? <p className="mt-1 truncate text-sm text-zinc-500">{log.notes}</p> : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-semibold">{formatVolume(log.total_volume, log.unit)}</p>
                    <p className="text-xs text-zinc-500">{log.duration_seconds > 0 ? formatDuration(log.duration_seconds) : ""}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        {page > 0 ? (
          <Link href={`/workouts?page=${page - 1}`} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Newer
          </Link>
        ) : <span />}
        {hasMore ? (
          <Link href={`/workouts?page=${page + 1}`} className="rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800">
            Older
          </Link>
        ) : null}
      </div>
    </div>
  );
}

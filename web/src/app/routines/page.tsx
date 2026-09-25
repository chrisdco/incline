import Link from "next/link";

import { getRoutines } from "@/lib/queries";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RoutinesPage() {
  const routines = await getRoutines();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Routines</h1>
        <p className="text-sm text-zinc-500">Build and edit routines in the mobile app.</p>
      </div>
      {routines.length === 0 ? (
        <EmptyState title="No routines yet" description="Create your first routine on mobile and it will appear here." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {routines.map((r) => (
            <Link key={r.id} href={`/routines/${r.id}`}>
              <Card className="transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                <p className="font-semibold">{r.name}</p>
                {r.description ? <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{r.description}</p> : null}
                <p className="mt-2 text-xs text-zinc-500">{r.difficulty} · {r.estimated_minutes} min</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";

import { getRoutine } from "@/lib/queries";
import { Badge, Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function RoutineDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const routine = await getRoutine(id);
  if (!routine) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/routines" className="text-sm text-zinc-500 hover:underline">← Routines</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{routine.routine.name}</h1>
        {routine.routine.description ? <p className="mt-1 text-sm text-zinc-500">{routine.routine.description}</p> : null}
        <p className="mt-1 text-xs text-zinc-500">{routine.routine.difficulty} · {routine.routine.estimated_minutes} min · {routine.routine.category}</p>
      </div>
      <div>
        <SectionTitle>Exercises ({routine.exercises.length})</SectionTitle>
        <div className="flex flex-col gap-2">
          {routine.exercises.map((ex) => {
            const key = `${ex.ref_type}:${ex.ref_type === "catalog" ? ex.catalog_external_id : ex.user_exercise_id}`;
            const resolved = routine.names.get(key);
            return (
              <Card key={ex.id} className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{resolved?.name ?? "Exercise"}</p>
                    <p className="text-sm text-zinc-500">
                      {ex.target_sets} × {ex.target_reps_min}–{ex.target_reps_max} · {ex.rest_seconds}s rest
                      {ex.superset_group != null ? " · Superset" : ""}
                    </p>
                    {ex.notes ? <p className="mt-0.5 truncate text-xs text-zinc-500">{ex.notes}</p> : null}
                  </div>
                  {resolved?.muscle ? <Badge>{resolved.muscle}</Badge> : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

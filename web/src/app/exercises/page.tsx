import Link from "next/link";

import { searchExercises } from "@/lib/queries";
import { Badge, Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const MUSCLES = ["chest", "back", "shoulders", "biceps", "triceps", "quads", "hamstrings", "core", "glutes", "calves", "forearms", "traps", "full_body"];

export default async function ExercisesPage({ searchParams }: { searchParams: Promise<{ q?: string; muscle?: string }> }) {
  const params = await searchParams;
  const q = params.q ?? "";
  const muscle = params.muscle ?? "";
  const { catalog, custom } = await searchExercises(q, muscle);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-extrabold tracking-tight">Exercises</h1>
      <form method="get" className="flex flex-col gap-2">
        <label htmlFor="exercise-search" className="sr-only">Search exercises</label>
        <input
          id="exercise-search"
          name="q"
          type="search"
          autoComplete="off"
          spellCheck={false}
          defaultValue={q}
          placeholder="Search exercises… e.g. bench press"
          className="rounded-xl border border-zinc-300 bg-white px-4 py-2.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-teal-600 dark:border-zinc-700 dark:bg-zinc-950"
        />
        <div className="flex flex-wrap gap-1.5">
          <Link
            href={`/exercises${q ? `?q=${encodeURIComponent(q)}` : ""}`}
            aria-current={!muscle ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-xs font-medium ${!muscle ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
          >
            All
          </Link>
          {MUSCLES.map((m) => (
            <Link
              key={m}
              aria-current={muscle === m ? "page" : undefined}
              href={`/exercises?${new URLSearchParams({ ...(q ? { q } : {}), muscle: m }).toString()}`}
              className={`rounded-full px-3 py-1 text-xs font-medium ${muscle === m ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
            >
              {m.replace("_", " ")}
            </Link>
          ))}
        </div>
      </form>

      {custom.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase">Yours ({custom.length})</h2>
          <div className="flex flex-col gap-2">
            {custom.map((ex) => (
              <Link key={ex.id} href={`/exercises/custom-${ex.id}`} className="[content-visibility:auto] [contain-intrinsic-size:auto_64px]">
                <Card className="py-3 transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold">{ex.name}</p>
                    <Badge>{ex.primary_muscle}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-zinc-500 uppercase">Catalog ({catalog.length})</h2>
        {catalog.length === 0 ? (
          <EmptyState title="No exercises found" description="Try a different search." />
        ) : (
          <div className="flex flex-col gap-2">
            {catalog.map((ex) => (
              <Link key={ex.external_id} href={`/exercises/${ex.external_id}`} className="[content-visibility:auto] [contain-intrinsic-size:auto_64px]">
                <Card className="py-3 transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{ex.name}</p>
                      <p className="text-xs text-zinc-500">{ex.equipment}</p>
                    </div>
                    <Badge>{ex.target_muscle}</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

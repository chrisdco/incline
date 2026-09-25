import Link from "next/link";
import dynamicChart from "next/dynamic";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getCatalogExercise, getCustomExercise, getExerciseHistory, getProfile } from "@/lib/queries";
import { formatDate, formatWeight } from "@/lib/format";
import { Badge, Card, EmptyState, SectionTitle } from "@/components/ui";

const TrendChart = dynamicChart(() => import("@/components/charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />,
});

export const dynamic = "force-dynamic";

export default async function ExerciseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const isCustom = id.startsWith("custom-");
  const catalog = isCustom ? null : await getCatalogExercise(id);
  const custom = isCustom ? await getCustomExercise(id.slice("custom-".length)) : null;
  const exercise = catalog ?? custom;
  if (!exercise) notFound();

  const name = exercise.name;
  const muscle = "target_muscle" in exercise ? exercise.target_muscle : exercise.primary_muscle;
  const [history, profile] = await Promise.all([
    getExerciseHistory(
      isCustom
        ? { ref_type: "custom", custom_id: (exercise as { id: string }).id }
        : { ref_type: "catalog", catalog_external_id: (exercise as { external_id: string }).external_id },
    ),
    getProfile(),
  ]);
  const unit = profile?.unit ?? "metric";
  const working = history.filter((h) => h.weight > 0);
  const heaviest = working.reduce((m, h) => Math.max(m, h.weight), 0);
  const bestE1rm = working.reduce((m, h) => Math.max(m, h.oneRm), 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/exercises" className="text-sm text-zinc-500 hover:underline">← Exercises</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{name}</h1>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Badge>{muscle}</Badge>
          <Badge>{exercise.equipment}</Badge>
          {"difficulty" in exercise && exercise.difficulty ? <Badge>{exercise.difficulty}</Badge> : null}
        </div>
        {"instructions" in exercise && exercise.instructions.length > 0 ? (
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
            {exercise.instructions.slice(0, 6).map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        ) : null}
        {"tips" in exercise && exercise.tips ? <p className="mt-2 text-sm text-zinc-500">Tip: {exercise.tips}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><p className="text-xs text-zinc-500">Heaviest</p><p className="mt-0.5 text-xl font-bold">{heaviest > 0 ? formatWeight(heaviest, unit) : "—"}</p></Card>
        <Card><p className="text-xs text-zinc-500">Best e1RM</p><p className="mt-0.5 text-xl font-bold">{bestE1rm > 0 ? formatWeight(bestE1rm, unit) : "—"}</p></Card>
        <Card><p className="text-xs text-zinc-500">Sessions</p><p className="mt-0.5 text-xl font-bold">{new Set(history.map((h) => h.logId)).size}</p></Card>
      </div>

      <div>
        <SectionTitle>Top-set progression</SectionTitle>
        <Card>
          {working.length >= 2 ? (
            <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />}>
              <TrendChart data={working.map((h) => ({ date: h.startedAt.slice(0, 10), value: h.weight }))} unit={unit} />
            </Suspense>
          ) : (
            <p className="text-sm text-zinc-500">Log at least twice to see a trend.</p>
          )}
        </Card>
      </div>

      <div>
        <SectionTitle>History</SectionTitle>
        {history.length === 0 ? (
          <EmptyState title="No history yet" description="Sets you log on mobile appear here after sync." />
        ) : (
          <div className="flex flex-col gap-2">
            {[...history].reverse().slice(0, 30).map((h, i) => (
              <Link key={`${h.logId}-${i}`} href={`/workouts/${h.logId}`}>
                <Card className="py-3 transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{formatWeight(h.weight, unit)} × {h.reps}</p>
                      <p className="text-xs text-zinc-500">{h.logName} · {formatDate(h.startedAt)}</p>
                    </div>
                    <p className="text-sm text-zinc-500">e1RM {formatWeight(h.oneRm, unit)}</p>
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

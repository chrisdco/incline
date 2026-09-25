import Link from "next/link";
import { notFound } from "next/navigation";

import { getWorkout } from "@/lib/queries";
import { formatDateTime, formatDuration, formatVolume, formatWeight } from "@/lib/format";
import { Badge, Card, SectionTitle, Stat } from "@/components/ui";
import type { SetEntryRow } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function WorkoutDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const workout = await getWorkout(id);
  if (!workout) notFound();
  const { log, sets, names } = workout;

  const groups = new Map<string, { name: string; muscle: string; sets: SetEntryRow[] }>();
  for (const s of sets) {
    const key = `${s.ref_type}:${s.ref_type === "catalog" ? s.catalog_external_id : s.user_exercise_id}`;
    const resolved = names.get(key);
    const entry = groups.get(key) ?? { name: resolved?.name ?? "Exercise", muscle: resolved?.muscle ?? "", sets: [] };
    entry.sets.push(s);
    groups.set(key, entry);
  }
  const completed = sets.filter((s) => s.completed).length;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/workouts" className="text-sm text-zinc-500 hover:underline">← Workouts</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{log.name}</h1>
        <p className="text-sm text-zinc-500">{formatDateTime(log.started_at)}</p>
        {log.notes ? <p className="mt-2 text-sm">{log.notes}</p> : null}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><Stat label="Volume" value={formatVolume(log.total_volume, log.unit)} /></Card>
        <Card><Stat label="Duration" value={log.duration_seconds > 0 ? formatDuration(log.duration_seconds) : "—"} /></Card>
        <Card><Stat label="Sets" value={`${completed}/${sets.length}`} /></Card>
      </div>

      <div>
        <SectionTitle>Exercises ({groups.size})</SectionTitle>
        <div className="flex flex-col gap-3">
          {[...groups.entries()].map(([key, group]) => (
            <Card key={key}>
              <div className="mb-2 flex items-center justify-between">
                <p className="font-semibold">{group.name}</p>
                {group.muscle ? <Badge>{group.muscle}</Badge> : null}
              </div>
              <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <caption className="sr-only">Sets for {group.name}</caption>
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th scope="col" className="py-1 font-medium">Set</th>
                    <th scope="col" className="font-medium">Weight</th>
                    <th scope="col" className="font-medium">Reps</th>
                    <th scope="col" className="font-medium">Type</th>
                    <th scope="col" className="font-medium">RPE</th>
                  </tr>
                </thead>
                <tbody>
                  {group.sets.map((s, i) => (
                    <tr key={s.id} className="border-t border-zinc-100 dark:border-zinc-800">
                      <td className="py-1.5 text-zinc-500">{i + 1}</td>
                      <td>{s.weight > 0 ? formatWeight(s.weight, log.unit) : "—"}</td>
                      <td>{s.reps}</td>
                      <td className="text-zinc-500">{s.set_type}{s.completed ? "" : " · open"}</td>
                      <td>{s.rpe ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

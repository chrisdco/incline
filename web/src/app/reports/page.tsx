import Link from "next/link";

import { getDashboard, getTwoWeekData } from "@/lib/queries";
import { formatDate, formatVolume, toDisplayWeight, weekStart } from "@/lib/format";
import { Card, SectionTitle, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [dashboard, twoWeeks] = await Promise.all([getDashboard(), getTwoWeekData()]);
  const unit = dashboard.profile?.unit ?? "metric";
  const ws = weekStart();

  const unitByLog = new Map<string, string>();
  for (const l of [...twoWeeks.week, ...twoWeeks.prev]) unitByLog.set(l.id, l.unit);
  const isWorking = (s: { set_type: string | null; weight: number; reps: number }) =>
    (s.set_type ?? "working") === "working" && s.weight > 0 && s.reps > 0;
  const workingVolume = (logIds: Set<string>) =>
    twoWeeks.sets
      .filter((s) => logIds.has(s.workout_log_id) && isWorking(s))
      .reduce((a, s) => a + toDisplayWeight(s.weight * s.reps, unitByLog.get(s.workout_log_id) ?? unit, unit), 0);
  const workingForLog = (logId: string, fallback: number, logUnit: string) => {
    const rows = twoWeeks.sets.filter((s) => s.workout_log_id === logId);
    if (rows.length === 0) return fallback;
    return rows
      .filter(isWorking)
      .reduce((a, s) => a + toDisplayWeight(s.weight * s.reps, logUnit, unit), 0);
  };

  const weekIds = new Set(twoWeeks.week.map((l) => l.id));
  const prevIds = new Set(twoWeeks.prev.map((l) => l.id));
  const weekVolume = workingVolume(weekIds);
  const prevVolume = workingVolume(prevIds);
  const delta = prevVolume > 0 ? Math.round(((weekVolume - prevVolume) / prevVolume) * 100) : null;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Reports</h1>

      <Card>
        <SectionTitle>This week · since {formatDate(ws.toISOString())}</SectionTitle>
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Sessions" value={String(twoWeeks.week.length)} />
          <Stat label="Working volume" value={formatVolume(weekVolume, unit)} />
          <Stat label="vs last week" value={delta == null ? "—" : `${delta >= 0 ? "+" : ""}${delta}%`} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          Working sets only — matches the mobile ghost and coaching math. Full month reports live in the mobile app.
        </p>
      </Card>

      <div>
        <SectionTitle>Latest sessions</SectionTitle>
        {dashboard.recent.length === 0 ? (
          <p className="text-sm text-zinc-500">No sessions yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dashboard.recent.slice(0, 5).map((log) => (
              <Link key={log.id} href={`/workouts/${log.id}`}>
                <Card className="py-3 transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{log.name}</p>
                      <p className="text-xs text-zinc-500">{formatDate(log.started_at)}</p>
                    </div>
                    <p className="text-sm font-medium">{formatVolume(workingForLog(log.id, log.total_volume, log.unit), unit)}</p>
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

import Link from "next/link";
import dynamicChart from "next/dynamic";
import { Suspense } from "react";

import { getDashboard, getMuscleSplit, getRecords, getTrainingDays, getVolumeSeries } from "@/lib/queries";
import { Card, SectionTitle, Stat } from "@/components/ui";
import { formatVolume, formatWeight } from "@/lib/format";

const VolumeChart = dynamicChart(() => import("@/components/charts").then((m) => m.VolumeChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />,
});

export const dynamic = "force-dynamic";

function ChartSkeleton() {
  return <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />;
}

function CalendarYear({ days, year }: { days: Map<string, number>; year: number }) {
  const jan1 = new Date(year, 0, 1);
  const startOffset = (jan1.getDay() + 6) % 7; // Monday start
  const cells: (string | null)[] = Array.from({ length: startOffset }, () => null);
  const isLeap = new Date(year, 1, 29).getMonth() === 1;
  const daysInYear = isLeap ? 366 : 365;
  for (let i = 0; i < daysInYear; i++) {
    const d = new Date(year, 0, 1 + i);
    cells.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const activeDays = [...days.values()].filter((c) => c > 0).length;
  return (
    <div role="img" aria-label={`${year} training calendar: ${activeDays} active days`}>
      <div className="flex gap-[3px] overflow-x-auto pb-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => {
              const count = day ? (days.get(day) ?? 0) : 0;
              const level = !day ? 0 : count === 0 ? 1 : count === 1 ? 2 : count === 2 ? 3 : 4;
              const fills = ["transparent", "rgb(235 240 238)", "rgb(172 214 207)", "rgb(64 156 144)", "rgb(13 105 94)"];
              return (
                <div
                  key={di}
                  title={day ? `${day}: ${count} workout${count === 1 ? "" : "s"}` : ""}
                  aria-hidden="true"
                  className="h-[11px] w-[11px] rounded-[3px] border border-zinc-200/60 dark:border-zinc-800"
                  style={{ backgroundColor: fills[level] }}
                />
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function ProgressPage() {
  const year = new Date().getFullYear();
  // Stats paint first; each heavy section below streams in on its own.
  const dashboard = await getDashboard();
  const unit = dashboard.profile?.unit ?? "metric";

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Progress</h1>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Workouts" value={String(dashboard.totalSessions)} /></Card>
        <Card><Stat label="Week streak" value={`${dashboard.streakWeeks}w`} /></Card>
        <Card><Stat label="Week volume" value={formatVolume(dashboard.weekVolume, unit)} /></Card>
        <Card><Stat label="All-time volume" value={formatVolume(dashboard.totalVolume, unit)} /></Card>
      </div>

      <Card>
        <SectionTitle>Volume — last 26 weeks</SectionTitle>
        <Suspense fallback={<ChartSkeleton />}>
          <VolumeSection unit={unit} />
        </Suspense>
      </Card>

      <Card>
        <SectionTitle>Muscles — last 30 days</SectionTitle>
        <Suspense fallback={<ChartSkeleton />}>
          <MusclesSection />
        </Suspense>
      </Card>

      <Card>
        <SectionTitle>Records — all-time bests</SectionTitle>
        <Suspense fallback={<ChartSkeleton />}>
          <RecordsSection unit={unit} />
        </Suspense>
      </Card>

      <Card>
        <SectionTitle>{year} consistency</SectionTitle>
        <Suspense fallback={<ChartSkeleton />}>
          <CalendarSection year={year} />
        </Suspense>
      </Card>
    </div>
  );
}

async function VolumeSection({ unit }: { unit: string }) {
  const series = await getVolumeSeries(26);
  const monthly = new Map<string, { sessions: number; volume: number }>();
  for (const w of series) {
    const key = w.weekStart.slice(0, 7);
    const m = monthly.get(key) ?? { sessions: 0, volume: 0 };
    m.sessions += w.sessions;
    m.volume += w.volume;
    monthly.set(key, m);
  }
  if (series.length === 0) return <p className="text-sm text-zinc-500">No training yet.</p>;
  return (
    <>
      <VolumeChart data={series} />
      {monthly.size > 0 ? (
        <div className="mt-4 grid grid-cols-3 gap-2 md:grid-cols-6">
          {[...monthly.entries()].slice(-6).map(([month, m]) => (
            <div key={month} className="rounded-xl bg-zinc-50 px-3 py-2 dark:bg-zinc-900">
              <p className="text-xs text-zinc-500">{new Date(`${month}-02T00:00:00`).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</p>
              <p className="text-sm font-semibold">{formatVolume(m.volume, unit)}</p>
              <p className="text-xs text-zinc-500">{m.sessions} sessions</p>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

async function MusclesSection() {
  const muscles30 = await getMuscleSplit(30);
  const topMuscleSets = muscles30.reduce((a, m) => a + m.sets, 0);
  if (muscles30.length === 0) return <p className="text-sm text-zinc-500">No working sets in range.</p>;
  return (
    <>
      <div className="flex flex-col gap-2">
        {muscles30.slice(0, 10).map((m) => (
          <div key={m.muscle} className="flex items-center gap-3" role="progressbar" aria-valuenow={m.sets} aria-valuemin={0} aria-valuemax={Math.max(1, muscles30[0].sets)} aria-label={`${m.muscle.replace(/_/g, " ")}: ${m.sets} sets`}>
            <p className="w-28 shrink-0 truncate text-sm capitalize">{m.muscle.replace(/_/g, " ")}</p>
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
              <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.max(4, Math.round((m.sets / Math.max(1, muscles30[0].sets)) * 100))}%` }} />
            </div>
            <p className="w-24 shrink-0 text-right text-xs text-zinc-500">{m.sets} sets · {topMuscleSets > 0 ? Math.round((m.sets / topMuscleSets) * 100) : 0}%</p>
          </div>
        ))}
      </div>
    </>
  );
}

async function RecordsSection({ unit }: { unit: string }) {
  const records = await getRecords(unit);
  if (records.length === 0) return <p className="text-sm text-zinc-500">Log working sets to set records.</p>;
  const leader = records.reduce((m, r) => (r.sets > m.sets ? r : m), records[0]);
  return (
    <>
    <table className="w-full text-sm">
      <caption className="sr-only">All-time best lifts per exercise</caption>
      <thead>
        <tr className="text-left text-xs text-zinc-500">
          <th scope="col" className="py-1 font-medium">Exercise</th>
          <th scope="col" className="font-medium">Heaviest</th>
          <th scope="col" className="font-medium">Best e1RM</th>
        </tr>
      </thead>
      <tbody>
        {records.slice(0, 10).map((r) => (
          <tr key={r.key} className="border-t border-zinc-100 dark:border-zinc-800">
            <td className="py-1.5 pr-2">
              <Link
                href={r.key.startsWith("custom:") ? `/exercises/custom-${r.key.slice("custom:".length)}` : `/exercises/${r.key.slice("catalog:".length)}`}
                className="font-medium hover:underline"
              >
                {r.name}
              </Link>
              <span className="ml-2 text-xs text-zinc-500">{r.muscle}</span>
            </td>
            <td>{formatWeight(r.heaviest, unit)}</td>
            <td>{formatWeight(r.bestE1rm, unit)}</td>
          </tr>
        ))}
      </tbody>
    </table>
    {leader ? (
      <p className="mt-3 text-xs text-zinc-500">Most logged: <span className="font-medium capitalize text-zinc-700 dark:text-zinc-300">{leader.name}</span> ({leader.sets} sets)</p>
    ) : null}
    </>
  );
}

async function CalendarSection({ year }: { year: number }) {
  const days = await getTrainingDays(year);
  return <CalendarYear days={days} year={year} />;
}

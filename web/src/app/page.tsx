import Link from "next/link";
import dynamicChart from "next/dynamic";
import { Suspense } from "react";

import { getDashboard, getVolumeSeries } from "@/lib/queries";
import { formatDateTime, formatVolume } from "@/lib/format";
import { Card, EmptyState, SectionTitle, Stat } from "@/components/ui";

const VolumeChart = dynamicChart(() => import("@/components/charts").then((m) => m.VolumeChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />,
});

export const dynamic = "force-dynamic";

async function VolumeSection() {
  const series = await getVolumeSeries(12);
  return series.length > 0 ? <VolumeChart data={series} /> : <p className="text-sm text-zinc-500">No training yet.</p>;
}

export default async function DashboardPage() {
  // Stats + recent paint first; the 12-week series streams in behind Suspense.
  const dashboard = await getDashboard();
  const unit = dashboard.profile?.unit ?? "metric";
  const name = dashboard.profile?.name?.trim() || "Athlete";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Welcome back, {name}</h1>
        <p className="text-sm text-zinc-500">Your training at a glance. Logging happens in the mobile app.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card><Stat label="Workouts" value={String(dashboard.totalSessions)} /></Card>
        <Card><Stat label="Week streak" value={`${dashboard.streakWeeks}w`} sub={`${dashboard.weekSessions} this week`} /></Card>
        <Card><Stat label="Week volume" value={formatVolume(dashboard.weekVolume, unit)} /></Card>
        <Card><Stat label="All-time volume" value={formatVolume(dashboard.totalVolume, unit)} /></Card>
      </div>

      <Card>
        <SectionTitle action={<Link href="/progress" className="text-sm font-medium text-teal-700 dark:text-teal-300">Progress</Link>}>
          Last 12 weeks
        </SectionTitle>
        <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />}>
          <VolumeSection />
        </Suspense>
      </Card>

      <div>
        <SectionTitle action={<Link href="/workouts" className="text-sm font-medium text-teal-700 dark:text-teal-300">All workouts</Link>}>
          Recent workouts
        </SectionTitle>
        {dashboard.recent.length === 0 ? (
          <EmptyState title="No workouts yet" description="Log your first session in the mobile app and it will show up here after sync." />
        ) : (
          <div className="flex flex-col gap-3">
            {dashboard.recent.map((log) => (
              <Link key={log.id} href={`/workouts/${log.id}`}>
                <Card className="transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{log.name}</p>
                      <p className="text-sm text-zinc-500">{formatDateTime(log.started_at)}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-semibold">{formatVolume(log.total_volume, log.unit)}</p>
                      <p className="text-xs text-zinc-500">{log.duration_seconds > 0 ? `${Math.round(log.duration_seconds / 60)} min` : ""}</p>
                    </div>
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

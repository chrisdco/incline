import Link from "next/link";
import dynamicChart from "next/dynamic";
import { Suspense } from "react";

import { getBodyweight, getMeasurementMetrics, getMeasurements } from "@/lib/queries";
import { Card, SectionTitle } from "@/components/ui";

const TrendChart = dynamicChart(() => import("@/components/charts").then((m) => m.TrendChart), {
  ssr: false,
  loading: () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />,
});

export const dynamic = "force-dynamic";

export default async function MeasurementsPage({ searchParams }: { searchParams: Promise<{ metric?: string }> }) {
  const params = await searchParams;
  // Bodyweight + metric list start together; the measurements query needs the
  // resolved metric, so it follows (unless ?metric= is already present).
  const [bodyweight, metrics] = await Promise.all([getBodyweight(365), getMeasurementMetrics()]);
  const activeMetric = params.metric ?? metrics[0] ?? "";
  const measurements = activeMetric ? await getMeasurements(activeMetric, 365) : [];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-extrabold tracking-tight">Measurements</h1>

      <Card>
        <SectionTitle>Bodyweight ({bodyweight.length})</SectionTitle>
        {bodyweight.length >= 2 ? (
          <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />}>
            <TrendChart
              data={bodyweight.map((b) => ({ date: b.recorded_at.slice(0, 10), value: b.weight }))}
              unit={bodyweight[bodyweight.length - 1]?.unit === "lb" ? "lb" : "kg"}
            />
          </Suspense>
        ) : (
          <p className="text-sm text-zinc-500">Log bodyweight on mobile to see the trend.</p>
        )}
      </Card>

      <div>
        <SectionTitle>Circumference & more</SectionTitle>
        {metrics.length === 0 ? (
          <p className="text-sm text-zinc-500">No tape measurements yet — log them under Measures on mobile.</p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap gap-1.5">
              {metrics.map((m) => (
                <Link
                  key={m}
                  href={`/measurements?metric=${encodeURIComponent(m)}`}
                  aria-current={activeMetric === m ? "page" : undefined}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${activeMetric === m ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900" : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"}`}
                >
                  {m.replace(/_/g, " ")}
                </Link>
              ))}
            </div>
            <Card>
              {measurements.length >= 2 ? (
                <Suspense fallback={<div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />}>
                  <TrendChart
                    data={measurements.map((r) => ({ date: r.recorded_at.slice(0, 10), value: r.value }))}
                    unit={measurements[measurements.length - 1]?.unit ?? "cm"}
                  />
                </Suspense>
              ) : (
                <p className="text-sm text-zinc-500">Need at least two entries for a trend ({measurements.length}).</p>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

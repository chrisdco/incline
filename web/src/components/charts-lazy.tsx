"use client";

import dynamic from "next/dynamic";

/**
 * Recharts measures the DOM, so charts render client-only. `ssr: false`
 * must live in a Client Component (Next rejects it in Server Components),
 * so pages import these instead of calling next/dynamic themselves.
 */
const Skeleton = () => <div className="h-64 animate-pulse rounded-xl bg-zinc-100 motion-reduce:animate-none dark:bg-zinc-900" />;

export const VolumeChart = dynamic(() => import("./charts").then((m) => m.VolumeChart), { ssr: false, loading: Skeleton });
export const TrendChart = dynamic(() => import("./charts").then((m) => m.TrendChart), { ssr: false, loading: Skeleton });

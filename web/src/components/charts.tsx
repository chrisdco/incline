"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function VolumeChart({ data }: { data: { weekStart: string; sessions: number; volume: number }[] }) {
  const rows = data.map((d) => ({
    week: d.weekStart.slice(5),
    volume: Math.round(d.volume),
    sessions: d.sessions,
  }));
  const total = rows.reduce((a, r) => a + r.volume, 0);
  return (
    <figure role="img" aria-label={`Weekly training volume chart: ${rows.length} weeks, ${total.toLocaleString()} total volume`}>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} />
            <Tooltip formatter={(value, name) => [Number(value).toLocaleString(), name === "volume" ? "Volume" : "Sessions"]} />
            <Bar dataKey="volume" fill="#0d9488" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export function TrendChart({ data, unit, label }: { data: { date: string; value: number }[]; unit: string; label?: string }) {
  const rows = data.map((d) => ({ date: d.date.slice(5), value: d.value }));
  const first = rows[0];
  const last = rows[rows.length - 1];
  return (
    <figure role="img" aria-label={label ?? `Trend chart: ${rows.length} points${first && last ? `, ${first.value} to ${last.value} ${unit}` : ""}`}>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} minTickGap={24} />
            <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={48} domain={["auto", "auto"]} />
            <Tooltip formatter={(value) => [`${value} ${unit}`, "Value"]} />
            <Area type="monotone" dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.15} strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

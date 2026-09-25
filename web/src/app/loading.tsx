export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-4 motion-reduce:animate-none" role="status" aria-live="polite" aria-label="Loading…">
      <div className="h-8 w-48 rounded-lg bg-zinc-200 dark:bg-zinc-800" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-2xl border border-zinc-200 dark:border-zinc-800" />
        ))}
      </div>
      <div className="h-64 rounded-2xl border border-zinc-200 dark:border-zinc-800" />
    </div>
  );
}

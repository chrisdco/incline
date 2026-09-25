import Link from "next/link";

import { getPrograms } from "@/lib/queries";
import { Card, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ProgramsPage() {
  const programs = await getPrograms();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">Programs</h1>
        <p className="text-sm text-zinc-500">Multi-week plans from the mobile app.</p>
      </div>
      {programs.length === 0 ? (
        <EmptyState title="No programs yet" description="Build a program on mobile to plan weeks ahead." />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {programs.map((p) => (
            <Link key={p.id} href={`/programs/${p.id}`}>
              <Card className="transition-colors motion-reduce:transition-none hover:border-zinc-300 dark:hover:border-zinc-700">
                <p className="font-semibold">{p.name}</p>
                {p.description ? <p className="mt-1 line-clamp-2 text-sm text-zinc-500">{p.description}</p> : null}
                <p className="mt-2 text-xs text-zinc-500">{p.weeks} weeks</p>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

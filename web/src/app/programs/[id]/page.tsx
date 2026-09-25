import Link from "next/link";
import { notFound } from "next/navigation";

import { getProgram } from "@/lib/queries";
import { Card, SectionTitle } from "@/components/ui";

export const dynamic = "force-dynamic";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default async function ProgramDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const program = await getProgram(id);
  if (!program) notFound();

  const weeks = [...new Set(program.slots.map((s) => s.week))].sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/programs" className="text-sm text-zinc-500 hover:underline">← Programs</Link>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{program.program.name}</h1>
        {program.program.description ? <p className="mt-1 text-sm text-zinc-500">{program.program.description}</p> : null}
      </div>
      {weeks.map((week) => (
        <div key={week}>
          <SectionTitle>Week {week}</SectionTitle>
          <div className="grid gap-2 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6, 7].map((day) => {
              const slots = program.slots.filter((s) => s.week === week && s.day === day);
              if (slots.length === 0) return null;
              return (
                <Card key={day} className="py-3">
                  <p className="mb-1 text-xs font-semibold tracking-wide text-zinc-500 uppercase">{DAYS[day - 1]}</p>
                  {slots.map((s) => (
                    <p key={s.id} className="text-sm font-medium">
                      {s.user_template_id && program.routineNames.get(s.user_template_id)
                        ? program.routineNames.get(s.user_template_id)
                        : s.ref_type === "seed"
                          ? `Template #${s.seed_template_id}`
                          : "Routine"}
                    </p>
                  ))}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

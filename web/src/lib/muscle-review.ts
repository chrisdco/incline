/** Shared with the app and MCP: one set of coaching rules (src/contracts/coaching). */
import { catalogMuscle } from "../../../src/contracts/mcp/tools";

export * from "../../../src/contracts/coaching/muscle-review";

/** Folds catalog spellings ("pectorals", "upper-back") onto app muscles and sums them. */
export function foldMuscles(rows: readonly { muscle: string; sets: number }[]): { muscle: string; sets: number }[] {
  const out = new Map<string, number>();
  for (const r of rows) {
    const m = catalogMuscle(r.muscle);
    out.set(m, (out.get(m) ?? 0) + r.sets);
  }
  return [...out].map(([muscle, sets]) => ({ muscle, sets }));
}

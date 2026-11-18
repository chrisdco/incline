import {
  AUTONOMY_COPY,
  REMEDY_LABEL,
  decisionSourceLabel,
  plateauSentence,
  type PlateauFinding,
} from "../../../src/contracts/coaching/progression";
import { planText } from "../../../src/contracts/mcp/shape";
import { Badge } from "@/components/ui";
import { declineFixAction, sendFixToAppAction, withdrawProposalAction } from "@/lib/progression-actions";
import type { WebProgression } from "@/lib/progression";

const BTN =
  "rounded-lg px-3 py-1.5 text-xs font-semibold outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

/**
 * Progress → Stalled lifts (PROGRESSION.md §7), the same findings as the app
 * and MCP. The web never changes a routine: "Send to app" queues the fix in
 * the app's plateau inbox; the phone applies it (and can undo it).
 */
export function StalledLifts({ data }: { data: WebProgression }) {
  const { findings, inbox, decisions, unit, autonomy } = data;
  const keys = new Set(findings.map((f) => f.exerciseKey));
  const loose = inbox.filter((d) => !keys.has(d.exerciseKey));
  const recent = decisions.filter((d) => d.status !== "proposed").slice(0, 5);

  if (autonomy === "off") {
    if (!findings.length) return <p className="text-sm text-zinc-500">No stalled lifts.</p>;
    return (
      <ul className="flex flex-col gap-1 text-sm">
        {findings.map((f) => (
          <li key={f.exerciseKey}>
            <span className="font-medium">{f.name}</span> <span className="text-zinc-500">· {f.sessions} sessions without progress</span>
          </li>
        ))}
        <li className="mt-1 text-xs text-zinc-500">Fix suggestions are off. Turn them on in Settings.</li>
      </ul>
    );
  }
  if (!findings.length && !loose.length) {
    return <p className="text-sm text-zinc-500">No stalled lifts. A lift shows here after several sessions without progress.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {findings.map((f) => (
        <Finding key={f.exerciseKey} f={f} unit={unit} pending={inbox.find((d) => d.exerciseKey === f.exerciseKey) ?? null} />
      ))}
      {loose.map((d) => (
        <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
          <div>
            <p className="font-semibold">{d.exerciseName || "Suggested change"}</p>
            <p className="text-sm text-zinc-500">
              {REMEDY_LABEL[d.remedy]}
              {d.params ? ` · ${planText(d.params, unit)}` : ""} · waiting in the app
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">{decisionSourceLabel(d.source)}</Badge>
            <form action={withdrawProposalAction}>
              <input type="hidden" name="id" value={d.id} />
              <button className={`${BTN} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900`}>Withdraw</button>
            </form>
          </div>
        </div>
      ))}
      {recent.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-zinc-500">Recent decisions</summary>
          <ul className="mt-2 flex flex-col gap-1">
            {recent.map((d) => (
              <li key={d.id} className="text-zinc-600 dark:text-zinc-400">
                {d.exerciseName || d.exerciseKey} · {REMEDY_LABEL[d.remedy]} · {d.status} by {decisionSourceLabel(d.source)} ·{" "}
                {new Date(d.createdAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <p className="text-xs text-zinc-500">
        Fixes apply on your phone, where they can be undone. {AUTONOMY_COPY[autonomy].label}: {AUTONOMY_COPY[autonomy].detail}
      </p>
    </div>
  );
}

function Finding({ f, unit, pending }: { f: PlateauFinding; unit: WebProgression["unit"]; pending: WebProgression["inbox"][number] | null }) {
  const options = [f.fix, ...f.alternatives];
  return (
    <div className="rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">{f.name}</p>
          <p className="text-sm text-zinc-500">{plateauSentence(f.sessions)}</p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{f.causeText}</p>
        </div>
        {f.status === "applied" ? (
          <Badge tone="success">Fix applied</Badge>
        ) : pending ? (
          <Badge tone="accent">Waiting in app · {decisionSourceLabel(pending.source)}</Badge>
        ) : null}
      </div>
      {f.status === "applied" ? (
        <p className="mt-2 text-sm">{planText(f.decision?.params ?? null, unit) ?? REMEDY_LABEL[f.fix.plan.remedy]} for the next session.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {options.map((o, i) => (
            <li key={o.plan.remedy} className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {i === 0 ? "Incline suggests: " : ""}
                  {REMEDY_LABEL[o.plan.remedy]}
                  {planText(o.plan, unit) ? ` · ${planText(o.plan, unit)}` : ""}
                </p>
                <p className="text-xs text-zinc-500">
                  {o.sentence} · evidence {o.evidence.grade}
                </p>
              </div>
              {o.plan.remedy === "deload" ? (
                <span className="text-xs text-zinc-500">Start a deload week in the app</span>
              ) : (
                <form action={sendFixToAppAction}>
                  <input type="hidden" name="exerciseKey" value={f.exerciseKey} />
                  <input type="hidden" name="remedy" value={o.plan.remedy} />
                  <button className={`${BTN} bg-teal-600 text-white hover:bg-teal-700`} disabled={!!pending}>
                    Send to app
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
      {f.status === "open" && !pending ? (
        <form action={declineFixAction} className="mt-3">
          <input type="hidden" name="exerciseKey" value={f.exerciseKey} />
          <input type="hidden" name="remedy" value={f.fix.plan.remedy} />
          <button className={`${BTN} text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900`}>Not now</button>
        </form>
      ) : null}
    </div>
  );
}

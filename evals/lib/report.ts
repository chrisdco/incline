import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface CaseResult {
  id: string;
  ok: boolean;
  /** Failure stage, e.g. 'http', 'json', 'schema', 'numbers', 'edge_disagrees'. */
  failure?: string;
  detail?: string;
  latencyMs: number;
  promptTokens: number | null;
  completionTokens: number | null;
}

export interface EvalSummary {
  task: string;
  provider: string;
  cases: number;
  passRate: number;
  failuresByStage: Record<string, number>;
  latencyP50Ms: number;
  latencyP95Ms: number;
  avgPromptTokens: number | null;
  avgCompletionTokens: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[Math.max(0, idx)]);
}

function avg(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => typeof v === 'number');
  if (nums.length === 0) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

export function summarize(task: string, provider: string, results: CaseResult[]): EvalSummary {
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const failuresByStage: Record<string, number> = {};
  for (const r of results) {
    if (!r.ok && r.failure) failuresByStage[r.failure] = (failuresByStage[r.failure] ?? 0) + 1;
  }
  return {
    task,
    provider,
    cases: results.length,
    passRate: results.length ? results.filter((r) => r.ok).length / results.length : 0,
    failuresByStage,
    latencyP50Ms: percentile(latencies, 50),
    latencyP95Ms: percentile(latencies, 95),
    avgPromptTokens: avg(results.map((r) => r.promptTokens)),
    avgCompletionTokens: avg(results.map((r) => r.completionTokens)),
  };
}

/** Writes evals/results/<task>-<provider>-<timestamp>.json (gitignored) and logs the summary. */
export function writeReport(summary: EvalSummary, results: CaseResult[]): string {
  const dir = path.resolve(__dirname, '..', 'results');
  mkdirSync(dir, { recursive: true });
  const safeProvider = summary.provider.replace(/[^a-z0-9._-]+/gi, '_');
  const file = path.join(dir, `${summary.task}-${safeProvider}-${Date.now()}.json`);
  writeFileSync(file, JSON.stringify({ summary, results }, null, 2));
  console.log(`\n[eval] ${summary.task} on ${summary.provider}`);
  console.table({
    cases: summary.cases,
    passRate: `${(summary.passRate * 100).toFixed(1)}%`,
    p50: `${summary.latencyP50Ms} ms`,
    p95: `${summary.latencyP95Ms} ms`,
    avgIn: summary.avgPromptTokens ?? '—',
    avgOut: summary.avgCompletionTokens ?? '—',
  });
  if (Object.keys(summary.failuresByStage).length) console.log('[eval] failures:', summary.failuresByStage);
  console.log(`[eval] report: ${file}`);
  return file;
}

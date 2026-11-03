import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** KEY=value lines from gitignored .env.local, limited to eval/provider keys. */
function localEnv(): Record<string, string> {
  const file = path.join(root, '.env.local');
  if (!existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^(EVAL_\w+|GROQ_\w+|OPENROUTER_\w+)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env)) out[m[1]] = m[2].trim();
  }
  return out;
}

// Model evals hit a real (or stub) provider, so they never run under `pnpm test`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    root,
    // Provider keys live in gitignored .env.local (GROQ_API_KEY, OPENROUTER_API_KEY).
    env: localEnv(),
    include: ['evals/**/*.eval.ts'],
    testTimeout: 30 * 60 * 1000,
    // One provider, one quota: run fixtures sequentially.
    fileParallelism: false,
    // Show the summary table on passing runs too.
    silent: false,
  },
});

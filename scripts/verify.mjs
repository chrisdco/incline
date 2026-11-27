#!/usr/bin/env node
/**
 * Runs CI's quality job locally, same steps, same order (.github/workflows/ci.yml),
 * stopping at the first failure. Run before every push: `node scripts/verify.mjs`
 * (or `pnpm verify`). `--fast` skips the integration tests.
 *
 * Calls each tool's node entry directly instead of `pnpm exec`, so it also works
 * in worktrees whose node_modules is a junction (pnpm refuses those).
 *
 * Keep in sync with ci.yml when a step is added there.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const fast = process.argv.includes('--fast');
const tsc = existsSync('node_modules/typescript-7/bin/tsc') ? 'node_modules/typescript-7/bin/tsc' : 'node_modules/typescript/bin/tsc';

const steps = [
  ['typecheck', [tsc, '--noEmit']],
  ['oxlint', ['node_modules/oxlint/bin/oxlint', '--quiet']],
  // expo lint's scope: /src, /app, /components (only src exists here).
  ['eslint', ['node_modules/eslint/bin/eslint.js', 'src', '--cache', '--cache-location', 'node_modules/.cache/verify/eslint/']],
  ['contracts in sync', ['scripts/sync-contracts.mjs', '--check']],
  ['React Compiler', ['scripts/compiler-check.mjs']],
  ['tests', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts', '--exclude', '**/*.integration.test.ts']],
  ...(fast ? [] : [['integration tests', ['node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.mts', 'integration']]]),
];

for (const [name, args] of steps) {
  const started = Date.now();
  process.stdout.write(`▸ ${name}\n`);
  const r = spawnSync(process.execPath, args, { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`\n✗ ${name} failed: CI would fail the same way.`);
    process.exit(r.status ?? 1);
  }
  process.stdout.write(`  ok (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
}
console.log('\n✓ All CI quality steps pass.');

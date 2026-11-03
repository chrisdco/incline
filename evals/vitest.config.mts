import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Model evals hit a real (or stub) provider, so they never run under `pnpm test`.
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
  test: {
    root,
    include: ['evals/**/*.eval.ts'],
    testTimeout: 10 * 60 * 1000,
    // One provider, one quota: run fixtures sequentially.
    fileParallelism: false,
  },
});

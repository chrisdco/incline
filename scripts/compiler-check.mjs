#!/usr/bin/env node
// React Compiler census: runs babel-plugin-react-compiler (with the options
// babel-preset-expo uses) over src/ and reports every function that bails.
// Exits 1 if any function fails to compile, so CI catches new bailouts.
//
//   pnpm run compiler:check            # list bailouts + summary
//   pnpm run compiler:check --verbose  # also list compiled functions
//   node scripts/compiler-check.mjs <dir>  # census another tree (default: src)
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const verbose = process.argv.includes('--verbose');
const srcDir = process.argv.slice(2).find((a) => !a.startsWith('--')) ?? join(root, 'src');

// pnpm doesn't hoist babel deps; resolve them the way babel-preset-expo does.
const require = createRequire(import.meta.url);
const presetRequire = createRequire(realpathSync(require.resolve('babel-preset-expo/package.json')));
const babel = presetRequire('@babel/core');
const reactCompiler = presetRequire('babel-plugin-react-compiler');

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      yield path;
    }
  }
}

const compiled = [];
// One entry per bailed function (the compiler can report several errors each).
const failed = new Map();

for (const file of walk(srcDir)) {
  const rel = relative(root, file).replaceAll('\\', '/');
  const logger = {
    logEvent(_filename, event) {
      if (event.kind === 'CompileSuccess') {
        compiled.push(`${rel}: ${event.fnName ?? '<anonymous>'}`);
      } else if (event.kind === 'CompileError' || event.kind === 'PipelineError') {
        const detail = event.detail;
        const reason = detail?.reason ?? detail?.options?.reason ?? String(detail?.message ?? detail);
        const loc = event.fnLoc ?? detail?.primaryLocation?.() ?? detail?.loc;
        const line = loc?.start?.line ?? '?';
        const key = `${rel}:${line}`;
        failed.set(key, [...new Set([...(failed.get(key) ?? []), reason])]);
      }
    },
  };
  try {
    babel.transformSync(readFileSync(file, 'utf8'), {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [[reactCompiler, { target: '19', panicThreshold: 'none', logger }]],
    });
  } catch (err) {
    failed.set(rel, [`babel error: ${err.message.split('\n')[0]}`]);
  }
}

if (verbose) for (const line of compiled) console.log(`ok   ${line}`);
for (const [key, reasons] of failed) console.log(`FAIL ${key}: ${reasons.join('; ')}`);
console.log(`\n${compiled.length} compiled, ${failed.size} bailed`);
process.exit(failed.size > 0 ? 1 : 0);

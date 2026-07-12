#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const runner = path.join(root, 'dist', 'scripts', 'release-gate-dag-runner.js');
const requested = process.argv.slice(2);
const hasSelection = requested.includes('--preset') || requested.includes('--gate');
const forwarded = hasSelection ? requested : ['--preset', 'release', '--full', ...requested];

console.error('release-parallel-check is a compatibility redirect to the manifest-backed release gate DAG.');
const result = spawnSync(process.execPath, [runner, ...forwarded], {
  cwd: root,
  env: process.env,
  stdio: 'inherit'
});

if (result.error) {
  console.error(`release-parallel-check redirect failed: ${result.error.message}`);
  process.exit(1);
}
if (result.signal) {
  console.error(`release-parallel-check redirect terminated by ${result.signal}`);
  process.exit(1);
}
process.exit(result.status ?? 1);

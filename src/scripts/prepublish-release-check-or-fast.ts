#!/usr/bin/env node
// @ts-nocheck
// Publish-time release stamp verifier.
//
// The final registry operation is deliberately not a release-check runner.
// It accepts only an authoritative full-release stamp that is already current
// and fails closed when the stamp is missing or stale. Operators refresh proof
// separately with `npm run release:check:full` so publish latency stays bounded
// and a registry command cannot silently launch the entire canonical test DAG.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

function runFastCheck() {
  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-fast-check.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function runStampVerify() {
  const result = spawnSync(process.execPath, ['./dist/scripts/release-check-stamp.js', 'verify'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

function failClosed(status = 1) {
  console.error('Prepublish requires a current authoritative full-release stamp.');
  console.error('Run `npm run release:check:full` separately, then rerun the publish command.');
  process.exit(status || 1);
}

function blockLifecyclePublish() {
  console.error('Lifecycle-enabled npm publish is unsupported because prepack would rebuild after authorization.');
  console.error('Run `npm run publish:prep-ignore-scripts`, then use `npm publish --ignore-scripts` only if you are the repository maintainer performing the separate publish handoff.');
  process.exit(2);
}

function main() {
  if (process.argv.includes('--block-lifecycle-publish') || process.env.npm_lifecycle_event === 'prepublishOnly') {
    blockLifecyclePublish();
  }
  const fast = runFastCheck();
  if (fast.status !== 0) failClosed(fast.status);

  const stamp = runStampVerify();
  if (stamp.status !== 0) failClosed(stamp.status);
}

main();

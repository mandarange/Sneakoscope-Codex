#!/usr/bin/env node
// @ts-nocheck
// Publish-time release check coordinator.
//
// Fast path: accept a current release-check stamp.
// Repair path: if the stamp is missing/stale, run the authoritative full
// `release:check` once, then require the fast check to pass.
//
// This keeps direct `npm publish` usable without weakening the publish gate:
// stale stamp repair is the full release gate, not a synthetic stamp write.
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function runFastCheck() {
  const result = spawnSync(process.execPath, ['./dist/scripts/prepublish-fast-check.js'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    ...result,
    report: parseLastJsonLine(result.stdout)
  };
}

function runReleaseCheck() {
  const override = process.env.SKS_PREPUBLISH_RELEASE_CHECK_CMD;
  if (override) {
    return spawnSync(override, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: process.env,
      shell: true,
      stdio: 'inherit'
    });
  }
  return spawnSync(npmCmd, ['run', 'release:check'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit'
  });
}

function parseLastJsonLine(text = '') {
  const lines = String(text).trim().split(/\n/).filter(Boolean).reverse();
  for (const line of lines) {
    try { return JSON.parse(line); } catch {
      // Keep looking; child processes may print non-JSON context.
    }
  }
  return null;
}

function isStaleOrMissingStamp(report) {
  if (!report) return false;
  if (report.reason === 'no_release_stamp') return true;
  const mismatched = Array.isArray(report.mismatched) ? report.mismatched : [];
  return mismatched.some((name) => [
    'package_version',
    'package_json_sha256',
    'package_files_list_sha256',
    'package_files_sha256',
    'release_gate_sha256',
    'stamp_unreadable'
  ].includes(name));
}

function main() {
  const first = runFastCheck();
  if (first.status === 0) process.exit(0);

  if (!isStaleOrMissingStamp(first.report)) {
    process.exit(first.status || 1);
  }

  if (process.env.SKS_PREPUBLISH_RUN_RELEASE_CHECK_ON_STALE === '0') {
    console.error('Prepublish release-check auto-repair disabled by SKS_PREPUBLISH_RUN_RELEASE_CHECK_ON_STALE=0.');
    process.exit(first.status || 1);
  }

  console.error('Prepublish release stamp is stale or missing; running full `npm run release:check` before publish.');
  const releaseCheck = runReleaseCheck();
  if (releaseCheck.status !== 0) process.exit(releaseCheck.status || 1);

  const second = runFastCheck();
  process.exit(second.status === 0 ? 0 : (second.status || 1));
}

main();

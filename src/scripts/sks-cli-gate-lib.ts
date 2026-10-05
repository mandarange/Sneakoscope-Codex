#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from '../core/fsx.js';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fixtureMissionRoots = new Map();
const fixtureRoots = new Set();
let fixtureCleanupRegistered = false;

export function assertGate(condition, message, detail = {}) {
  if (condition) return;
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2));
  process.exit(1);
}

export function emitGate(name, detail = {}) {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate: name, ...detail }, null, 2));
}

export function runSksJson(args, options = {}) {
  return runEntrypointJson(path.join(root, 'dist', 'bin', 'sks.js'), args, options);
}

export function runEntrypointJson(entrypoint, args, options = {}) {
  assertGate(fs.existsSync(entrypoint), 'dist entrypoint missing; run npm run build first', { entrypoint });
  const mappedMissionRoot = args.map((arg) => fixtureMissionRoots.get(String(arg))).find(Boolean);
  const result = spawnSync(process.execPath, [entrypoint, ...args], {
    cwd: options.cwd || mappedMissionRoot || root,
    encoding: 'utf8',
    timeout: Number(process.env.SKS_GATE_TIMEOUT_MS || 120_000),
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', CI: 'true', ...(options.env || {}) }
  });
  let parsed = null;
  try {
    parsed = JSON.parse(result.stdout);
  } catch (err) {
    assertGate(false, 'sks command did not emit parseable JSON', { args, stdout: result.stdout, error: err.message });
  }
  if (result.status !== 0 && !parsed?.mission_id && options.allowFailure !== true) {
    assertGate(false, 'sks command failed', { args, status: result.status, stdout: result.stdout, stderr: result.stderr });
  }
  return { ...parsed, _process_status: result.status, _stderr_tail: String(result.stderr || '').slice(-600) };
}

export function runDfixFixture() {
  const json = runHermeticRouteFixture('dfix', ['dfix', 'fixture', '--json']);
  json.gate = json.gate || json.artifacts?.gate;
  assertGate(json.ok === true, 'dfix fixture blocked', json);
  assertGate(json.gate?.passed === true, 'dfix gate did not pass', json.gate);
  return json;
}

export function missionFile(missionId, file) {
  const missionRoot = fixtureMissionRoots.get(missionId) || root;
  return path.join(missionRoot, '.sneakoscope', 'missions', missionId, file);
}

export function readMissionJson(missionId, file) {
  const absolute = missionFile(missionId, file);
  assertGate(fs.existsSync(absolute), `mission artifact missing: ${file}`, { mission_id: missionId, absolute });
  return JSON.parse(fs.readFileSync(absolute, 'utf8'));
}

function createHermeticRouteFixtureRoot(label) {
  const fixtureRoot = tmpdir(`${label}-release-fixture-`);
  fs.writeFileSync(path.join(fixtureRoot, 'package.json'), `${JSON.stringify({ name: `sks-${label}-release-fixture`, private: true })}\n`);
  fixtureRoots.add(fixtureRoot);
  if (!fixtureCleanupRegistered) {
    fixtureCleanupRegistered = true;
    process.once('exit', () => {
      for (const candidate of fixtureRoots) fs.rmSync(candidate, { recursive: true, force: true });
    });
  }
  return fixtureRoot;
}

function runHermeticRouteFixture(label, args, env = {}) {
  const fixtureRoot = createHermeticRouteFixtureRoot(label);
  const fixtureHome = path.join(fixtureRoot, 'home');
  const json = runSksJson(args, {
    cwd: fixtureRoot,
    env: {
      HOME: fixtureHome,
      CODEX_HOME: path.join(fixtureHome, '.codex'),
      SKS_GLOBAL_ROOT: path.join(fixtureHome, '.sneakoscope-global'),
      TMPDIR: fixtureRoot,
      TMP: fixtureRoot,
      TEMP: fixtureRoot,
      PWD: fixtureRoot,
      SKS_TEST_ISOLATION: '1',
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
      NODE_ENV: 'test',
      CI: 'true',
      ...env
    }
  });
  if (json.mission_id) fixtureMissionRoots.set(json.mission_id, fixtureRoot);
  json.fixture_root = fixtureRoot;
  return json;
}

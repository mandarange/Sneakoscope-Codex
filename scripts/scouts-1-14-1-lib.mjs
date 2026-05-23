import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ensureDistFresh } from './lib/ensure-dist-fresh.mjs';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const reportDir = path.join(root, '.sneakoscope', 'reports');

export async function ensureDist() {
  const bin = path.join(root, 'dist', 'bin', 'sks.js');
  const freshness = ensureDistFresh({ rebuild: true });
  if (!freshness.ok) throw new Error(`dist_not_fresh:${freshness.issues.join(',')}`);
  if (!fs.existsSync(bin)) throw new Error('dist_bin_missing_after_freshness_check');
  return bin;
}

export async function runFiveScoutFixture({
  missionId = null,
  engine = 'local-static',
  mock = true,
  writeCanonical = true,
  requireOutputSchema = false,
  parallel = true,
  mode = 'release-check',
  task = 'SKS 1.14.1 Scout multi-session release gate fixture'
} = {}) {
  await ensureDist();
  const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'scouts', 'scout-runner.js')).href);
  const id = missionId || await createScoutMission(task);
  return mod.runFiveScoutIntake(root, {
    missionId: id,
    route: '$Team',
    task,
    mode,
    parallel,
    engine,
    requireOutputSchema,
    mock,
    writeCanonical
  });
}

export async function createScoutMission(prompt = 'SKS 1.14.1 Scout release-check mission') {
  await ensureDist();
  const mod = await import(pathToFileURL(path.join(root, 'dist', 'core', 'mission.js')).href);
  const created = await mod.createMission(root, { mode: 'scouts', prompt });
  return created.id;
}

export async function runSksJson(args, opts = {}) {
  const bin = await ensureDist();
  const result = spawnSync(process.execPath, [bin, ...args], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...(opts.env || {}) },
    maxBuffer: 20 * 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(`sks_command_failed:${args.join(' ')}:${trim(result.stderr || result.stdout)}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch (err) {
    throw new Error(`sks_json_parse_failed:${args.join(' ')}:${trim(result.stdout)}`);
  }
}

export async function readJson(file, fallback = null) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export async function writeReport(name, report) {
  await fsp.mkdir(reportDir, { recursive: true });
  const file = path.join(reportDir, name);
  await fsp.writeFile(file, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
  return file;
}

export function missionDir(missionId) {
  return path.join(root, '.sneakoscope', 'missions', missionId);
}

export async function scoutRoleResults(missionId, namespace = 'canonical') {
  const base = namespace === 'canonical'
    ? missionDir(missionId)
    : path.join(missionDir(missionId), namespace);
  const ids = [
    'scout-1-code-surface',
    'scout-2-verification',
    'scout-3-safety-db',
    'scout-4-visual-voxel',
    'scout-5-simplification-integration'
  ];
  return Promise.all(ids.map((id) => readJson(path.join(base, `${id}.json`))));
}

export async function existingCanonicalFingerprint(missionId) {
  const base = missionDir(missionId);
  const files = [
    'scout-team-plan.json',
    'scout-parallel-ledger.jsonl',
    'scout-consensus.json',
    'scout-handoff.md',
    'scout-gate.json',
    'scout-engine-result.json',
    'scout-readonly-guard.json',
    'scout-performance.json'
  ];
  const out = {};
  for (const file of files) {
    const absolute = path.join(base, file);
    out[file] = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
  }
  return out;
}

export function assertCondition(condition, blockers, issue) {
  if (!condition) blockers.push(issue);
}

export function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

export function trim(text) {
  return String(text || '').trim().slice(-4000);
}

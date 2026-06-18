import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { computeTriWikiCacheKey } from '../triwiki/triwiki-cache-key.js';

export const BUILD_ONCE_PROOF_SCHEMA = 'sks.build-once-proof.v1';

export interface BuildOnceProof {
  schema: typeof BUILD_ONCE_PROOF_SCHEMA;
  ok: boolean;
  root: string;
  mode: 'incremental' | 'clean';
  cache_key: string;
  source_hash: string;
  package_lock_hash: string;
  tsconfig_hash: string;
  dist_hash: string;
  started_at: string;
  completed_at: string;
  created_at: string;
  status: number | null;
  duration_ms: number;
  reused: boolean;
  blockers: string[];
}

export function runBuildOnce(input: { root: string; mode?: 'incremental' | 'clean'; force?: boolean; env?: NodeJS.ProcessEnv }): BuildOnceProof {
  const root = path.resolve(input.root);
  const mode = input.mode || 'incremental';
  const key = computeTriWikiCacheKey({
    root,
    id: 'build-once',
    inputs: ['src/**/*.ts', 'package.json', 'package-lock.json', 'tsconfig.json', 'src/scripts/build*.ts', 'src/scripts/ensure-bin-executable.ts'],
    implementationFiles: ['tsconfig.json', 'src/core/build/build-once-runner.ts', 'src/scripts/build-once-runner-check.ts'],
    envAllowlist: ['NODE_ENV', 'CI'],
    fixtureVersion: 'sks-4.0.2'
  });
  const existing = readBuildOnceProof(root);
  if (!input.force && existing?.ok === true && existing.cache_key === key.key && distTargetsReady(root).length === 0) {
    return { ...existing, mode, reused: true };
  }
  if (mode === 'clean') {
    fs.rmSync(path.join(root, 'dist'), { recursive: true, force: true });
    fs.rmSync(path.join(root, '.sneakoscope', 'cache', 'tsbuildinfo'), { recursive: true, force: true });
  }
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const run = spawnSync('npm', ['run', mode === 'clean' ? 'build:clean' : 'build:incremental', '--silent'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
    env: { ...process.env, ...(input.env || {}), CI: process.env.CI || input.env?.CI || 'true' }
  });
  const missingDistTargets = distTargetsReady(root);
  const blockers = [
    ...(run.status === 0 ? [] : [`build_failed:${run.status ?? 'signal'}`]),
    ...missingDistTargets.map((target) => `dist_target_missing:${target}`)
  ];
  const completedAt = new Date().toISOString();
  const proof: BuildOnceProof = {
    schema: BUILD_ONCE_PROOF_SCHEMA,
    ok: run.status === 0 && missingDistTargets.length === 0,
    root,
    mode,
    cache_key: key.key,
    source_hash: key.input_hash,
    package_lock_hash: key.package_lock_hash,
    tsconfig_hash: computeTriWikiCacheKey({ root, id: 'build-once:tsconfig', inputs: ['tsconfig.json'] }).input_hash,
    dist_hash: computeTriWikiCacheKey({ root, id: 'build-once:dist', inputs: ['dist'] }).input_hash,
    started_at: startedAt,
    completed_at: completedAt,
    created_at: completedAt,
    status: run.status,
    duration_ms: Math.max(0, Date.now() - started),
    reused: false,
    blockers
  };
  writeBuildOnceProof(root, proof);
  return proof;
}

export function readBuildOnceProof(root: string): BuildOnceProof | null {
  const file = buildProofPath(root);
  try {
    if (!fs.existsSync(file)) return null;
    const json = JSON.parse(fs.readFileSync(file, 'utf8')) as BuildOnceProof;
    return json.schema === BUILD_ONCE_PROOF_SCHEMA ? json : null;
  } catch {
    return null;
  }
}

export function writeBuildOnceProof(root: string, proof: BuildOnceProof): string {
  const file = buildProofPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(proof, null, 2)}\n`);
  const report = path.join(root, '.sneakoscope', 'reports', 'build-once-proof.json');
  fs.mkdirSync(path.dirname(report), { recursive: true });
  fs.writeFileSync(report, `${JSON.stringify(proof, null, 2)}\n`);
  return file;
}

function buildProofPath(root: string): string {
  return path.join(root, 'dist', '.sks-build-proof.json');
}

function distTargetsReady(root: string): string[] {
  const required = new Set<string>(['dist/bin/sks.js']);
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
    for (const command of Object.values(pkg.scripts || {})) {
      const match = String(command).match(/node\s+\.\/dist\/scripts\/([^\s]+\.js)/);
      if (match?.[1]) required.add(`dist/scripts/${match[1]}`);
    }
  } catch {
    required.add('dist/scripts/build-once-runner-check.js');
  }
  return [...required].sort().filter((rel) => !fs.existsSync(path.join(root, rel)));
}

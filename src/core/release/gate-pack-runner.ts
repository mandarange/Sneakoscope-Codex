import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { computeTriWikiCacheKey } from '../triwiki/triwiki-cache-key.js';
import { createTriWikiProofCard } from '../triwiki/triwiki-proof-card.js';
import { readReusableTriWikiProofCard, writeTriWikiProofCard } from '../triwiki/triwiki-proof-bank.js';
import { buildGatePackManifest } from './gate-pack-manifest.js';
import { prepareGatePackFixture } from './gate-pack-fixture-cache.js';
import { writeGatePackSharedArtifact } from './gate-pack-assertion.js';
import { loadPackageScripts, loadReleaseGateManifest } from '../triwiki/triwiki-gate-impact-map.js';

export const GATE_PACK_RUNNER_SCHEMA = 'sks.gate-pack-runner.v1';

export interface GatePackRunnerResult {
  schema: typeof GATE_PACK_RUNNER_SCHEMA;
  ok: boolean;
  root: string;
  pack_id: string;
  mode: 'plan' | 'execute';
  reused: number;
  executed: number;
  failed: number;
  proof_paths: string[];
  blockers: string[];
  shared_setup_count?: number;
  parallelism_gain?: number;
  critical_path_ms?: number;
  reused_proof_count?: number;
  executed_gate_count?: number;
}

export interface GatePackExecuteInput {
  root: string;
  packId: string;
  mode?: 'plan' | 'execute' | 'assert-only';
  env?: NodeJS.ProcessEnv;
  maxParallel?: number;
}

export function runGatePack(input: { root: string; packId: string; execute?: boolean; env?: NodeJS.ProcessEnv }): GatePackRunnerResult {
  void input;
  throw new Error('gate_pack_legacy_sync_runner_removed');
}

export async function executeGatePack(input: GatePackExecuteInput): Promise<GatePackRunnerResult> {
  const mode = input.mode || 'execute';
  const manifest = buildGatePackManifest(input.root);
  const pack = manifest.packs.find((candidate) => candidate.id === input.packId);
  if (!pack) {
    return { schema: GATE_PACK_RUNNER_SCHEMA, ok: false, root: input.root, pack_id: input.packId, mode: mode === 'plan' ? 'plan' : 'execute', reused: 0, executed: 0, failed: 0, proof_paths: [], blockers: ['pack_missing'] };
  }
  const gates = loadReleaseGateManifest(input.root).gates.filter((gate) => pack.gate_ids.includes(gate.id));
  if (mode === 'plan') {
    return { schema: GATE_PACK_RUNNER_SCHEMA, ok: true, root: input.root, pack_id: input.packId, mode: 'plan', reused: 0, executed: 0, failed: 0, proof_paths: [], blockers: [], shared_setup_count: 0, parallelism_gain: 1, critical_path_ms: pack.estimated_ms, reused_proof_count: 0, executed_gate_count: 0 };
  }
  const fixture = await prepareGatePackFixture({ root: input.root, packId: input.packId, fixtureVersion: 'sks-4.0.2' });
  const artifactPath = writeGatePackSharedArtifact({ root: input.root, pack, fixturePath: fixture.run_path });
  const scripts = loadPackageScripts(input.root);
  const blockers: string[] = [];
  const proofPaths: string[] = [];
  let reused = 0;
  let executed = 0;
  let failed = 0;
  let sumMs = 0;
  let criticalPathMs = 0;
  const pending = gates.slice();
  const maxParallel = Math.max(1, Math.min(input.maxParallel || 4, pending.length || 1));
  const workers = Array.from({ length: maxParallel }, async () => {
    while (pending.length) {
      const gate = pending.shift();
      if (!gate) return;
      const cacheKey = computeTriWikiCacheKey({
        root: input.root,
        id: gate.id,
        inputs: gate.cache.inputs,
        implementationFiles: [`src/scripts/${scriptFileForCommand(gate.command) || ''}`].filter(Boolean),
        envAllowlist: ['CI', 'SKS_FAST_MODE', 'SKS_RELEASE_PRESET'],
        fixtureVersion: fixture.fixture_version
      });
      const hit = readReusableTriWikiProofCard({ root: input.root, subjectId: gate.id, cacheKey: cacheKey.key });
      if (hit.hit) {
        reused += 1;
        if (hit.path) proofPaths.push(hit.path);
        continue;
      }
      if (mode === 'assert-only') {
        failed += 1;
        blockers.push(`proof_missing:${gate.id}`);
        continue;
      }
      const scriptName = scriptNameForCommand(gate.command);
      if (!scriptName || !scripts[scriptName]) {
        failed += 1;
        blockers.push(`script_missing:${gate.id}`);
        continue;
      }
      const started = Date.now();
      const run = await spawnNpmScript(input.root, scriptName, { ...(input.env || {}), SKS_GATE_PACK_ARTIFACT: artifactPath });
      const duration = Math.max(0, Date.now() - started);
      sumMs += duration;
      criticalPathMs = Math.max(criticalPathMs, duration);
      executed += 1;
      const passed = run.status === 0;
      if (!passed) {
        failed += 1;
        blockers.push(`gate_failed:${gate.id}`);
      }
      const card = createTriWikiProofCard({
        subject_type: 'gate',
        subject_id: gate.id,
        cache_key: cacheKey.key,
        input_hash: cacheKey.input_hash,
        implementation_hash: cacheKey.implementation_hash,
        gate_impl_hash: cacheKey.implementation_hash,
        package_lock_hash: cacheKey.package_lock_hash,
        release_gates_hash: cacheKey.release_gates_hash,
        env_allowlist_hash: cacheKey.env_allowlist_hash,
        tool_versions: cacheKey.tool_versions,
        tool_version: cacheKey.tool_version,
        fixture_version: cacheKey.fixture_version,
        result: passed ? 'passed' : 'failed',
        reusable: passed,
        duration_ms: duration,
        evidence: { status: run.status, stdout_tail: tail(run.stdout), stderr_tail: tail(run.stderr), fixture_path: fixture.run_path, shared_artifact_path: artifactPath },
        invalidation_reasons: passed ? [] : ['gate_failed']
      });
      proofPaths.push(writeTriWikiProofCard(input.root, card));
    }
  });
  await Promise.all(workers);
  const packCard = createTriWikiProofCard({
    subject_type: 'gate-pack',
    subject_id: input.packId,
    cache_key: `pack:${input.packId}:${gates.map((gate) => gate.id).sort().join(',')}`,
    input_hash: computeTriWikiCacheKey({ root: input.root, id: `pack:${input.packId}`, inputs: gates.flatMap((gate) => gate.cache.inputs), fixtureVersion: fixture.fixture_version }).input_hash,
    gate_impl_hash: `pack-runner:${GATE_PACK_RUNNER_SCHEMA}`,
    package_lock_hash: computeTriWikiCacheKey({ root: input.root, id: `pack:${input.packId}:meta`, inputs: [] }).package_lock_hash,
    release_gates_hash: computeTriWikiCacheKey({ root: input.root, id: `pack:${input.packId}:meta`, inputs: [] }).release_gates_hash,
    env_allowlist_hash: computeTriWikiCacheKey({ root: input.root, id: `pack:${input.packId}:meta`, inputs: [], envAllowlist: ['CI', 'SKS_FAST_MODE'] }).env_allowlist_hash,
    tool_versions: { sks: computeTriWikiCacheKey({ root: input.root, id: `pack:${input.packId}:meta`, inputs: [] }).tool_version },
    fixture_version: fixture.fixture_version,
    result: failed === 0 ? 'passed' : 'failed',
    reusable: failed === 0,
    evidence: { gate_count: gates.length, reused, executed, failed, shared_artifact_path: artifactPath },
    invalidation_reasons: failed === 0 ? [] : ['pack_gate_failed']
  });
  proofPaths.push(writeTriWikiProofCard(input.root, packCard));
  const report: GatePackRunnerResult = {
    schema: GATE_PACK_RUNNER_SCHEMA,
    ok: blockers.length === 0,
    root: input.root,
    pack_id: input.packId,
    mode: 'execute',
    reused,
    executed,
    failed,
    proof_paths: proofPaths,
    blockers,
    shared_setup_count: fixture.setup_count,
    parallelism_gain: criticalPathMs > 0 ? Number((sumMs / criticalPathMs).toFixed(2)) : 1,
    critical_path_ms: criticalPathMs,
    reused_proof_count: reused,
    executed_gate_count: executed
  };
  writeGatePackReport(input.root, report);
  return report;
}

function writeGatePackReport(root: string, report: GatePackRunnerResult): void {
  const file = path.join(root, '.sneakoscope', 'reports', 'gate-pack-runner.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);
}

function scriptNameForCommand(command: string): string | null {
  const match = command.match(/^npm run ([^ ]+)/);
  return match?.[1] || null;
}

function scriptFileForCommand(command: string): string | null {
  const script = scriptNameForCommand(command);
  if (!script) return null;
  return `${script.replace(/[:]/g, '-')}${script.includes('blackbox') ? '' : '-check'}.ts`;
}

function tail(value: string, limit = 2000): string {
  return value.length > limit ? value.slice(-limit) : value;
}

function spawnNpmScript(root: string, scriptName: string, env?: NodeJS.ProcessEnv): Promise<{ status: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('npm', ['run', scriptName, '--silent'], {
      cwd: root,
      env: { ...process.env, ...(env || {}), CI: process.env.CI || 'true' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => { stdout = tail(stdout + String(chunk)); });
    child.stderr?.on('data', (chunk) => { stderr = tail(stderr + String(chunk)); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

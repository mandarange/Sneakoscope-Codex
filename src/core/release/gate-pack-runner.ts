import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { computeTriWikiCacheKey } from '../triwiki/triwiki-cache-key.js';
import { createTriWikiProofCard } from '../triwiki/triwiki-proof-card.js';
import { readReusableTriWikiProofCard, writeTriWikiProofCard } from '../triwiki/triwiki-proof-bank.js';
import { buildGatePackManifest } from './gate-pack-manifest.js';
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
}

export function runGatePack(input: { root: string; packId: string; execute?: boolean; env?: NodeJS.ProcessEnv }): GatePackRunnerResult {
  const manifest = buildGatePackManifest(input.root);
  const pack = manifest.packs.find((candidate) => candidate.id === input.packId);
  if (!pack) {
    return { schema: GATE_PACK_RUNNER_SCHEMA, ok: false, root: input.root, pack_id: input.packId, mode: input.execute ? 'execute' : 'plan', reused: 0, executed: 0, failed: 0, proof_paths: [], blockers: ['pack_missing'] };
  }
  const gates = loadReleaseGateManifest(input.root).gates.filter((gate) => pack.gate_ids.includes(gate.id));
  const scripts = loadPackageScripts(input.root);
  const blockers: string[] = [];
  const proofPaths: string[] = [];
  let reused = 0;
  let executed = 0;
  let failed = 0;
  for (const gate of gates) {
    if (!input.execute) continue;
    const cacheKey = computeTriWikiCacheKey({
      root: input.root,
      id: gate.id,
      inputs: gate.cache.inputs,
      implementationFiles: [`src/scripts/${scriptFileForCommand(gate.command) || ''}`].filter(Boolean),
      envAllowlist: ['CI', 'SKS_FAST_MODE', 'SKS_RELEASE_PRESET'],
      fixtureVersion: 'sks-4.0.0'
    });
    const hit = readReusableTriWikiProofCard({ root: input.root, subjectId: gate.id, cacheKey: cacheKey.key });
    if (hit.hit) {
      reused += 1;
      if (hit.path) proofPaths.push(hit.path);
      continue;
    }
    const scriptName = scriptNameForCommand(gate.command);
    if (!scriptName || !scripts[scriptName]) {
      failed += 1;
      blockers.push(`script_missing:${gate.id}`);
      continue;
    }
    const started = Date.now();
    const run = spawnSync('npm', ['run', scriptName, '--silent'], {
      cwd: input.root,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, ...(input.env || {}), CI: process.env.CI || 'true' }
    });
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
      tool_version: cacheKey.tool_version,
      fixture_version: cacheKey.fixture_version,
      result: passed ? 'passed' : 'failed',
      reusable: passed,
      duration_ms: Math.max(0, Date.now() - started),
      evidence: {
        status: run.status,
        stdout_tail: tail(String(run.stdout || '')),
        stderr_tail: tail(String(run.stderr || ''))
      },
      invalidation_reasons: passed ? [] : ['gate_failed']
    });
    proofPaths.push(writeTriWikiProofCard(input.root, card));
  }
  const report: GatePackRunnerResult = {
    schema: GATE_PACK_RUNNER_SCHEMA,
    ok: blockers.length === 0,
    root: input.root,
    pack_id: input.packId,
    mode: input.execute ? 'execute' : 'plan',
    reused,
    executed,
    failed,
    proof_paths: proofPaths,
    blockers
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

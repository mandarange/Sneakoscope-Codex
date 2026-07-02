// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { tmpdir } from '../../core/fsx.js';
import { emitGate, importDist, root } from '../sks-1-18-gate-lib.js';

export async function runRealCodexParallelGate({ workers, gate }) {
  const reportPath = path.join(root, '.sneakoscope', 'reports', `${gate.replace(/[:]/g, '-')}.json`);
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  const required = process.env.SKS_REQUIRE_REAL_CODEX_PARALLEL === '1';
  if (process.env.SKS_TEST_REAL_CODEX_PARALLEL !== '1') {
    const report = {
      schema: 'sks.real-codex-parallel-gate.v1',
      ok: !required,
      status: required ? 'blocked' : 'integration_optional',
      proof_level: required ? 'real_required_missing' : 'integration_optional',
      requested_workers: workers,
      required,
      blockers: required ? ['real_codex_parallel_not_requested'] : []
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    emitGate(gate, { status: report.status, requested_workers: workers });
    process.exit(required ? 1 : 0);
  }
  const fixture = tmpdir('sks-real-codex-parallel-');
  const targetFiles = Array.from({ length: workers }, (_, index) => `target-${String(index + 1).padStart(3, '0')}.txt`);
  for (const file of targetFiles) fs.writeFileSync(path.join(fixture, file), `before ${file}\n`);
  const prompt = [
    'Real Codex parallel worker proof.',
    `Each worker has an independent write target: ${targetFiles.map((file) => `\`${file}\``).join(', ')}.`,
    'Return valid SKS agent result JSON.',
    'For write-capable slices, emit model_authored patch_envelopes with lease proof, verification hints, and rollback hints.'
  ].join(' ');
  const run = spawnSync(process.execPath, [
    path.join(root, 'dist', 'bin', 'sks.js'),
    'agent',
    'run',
    prompt,
    '--backend',
    'codex-sdk',
    '--real',
    '--agents',
    String(workers),
    '--target-active-slots',
    String(workers),
    '--minimum-work-items',
    String(workers),
    '--work-items',
    String(workers),
    '--write-mode',
    'parallel',
    '--json'
  ], {
    cwd: fixture,
    encoding: 'utf8',
    env: { ...process.env, SKS_SKIP_NPM_FRESHNESS_CHECK: '1', SKS_TEST_REAL_CODEX_PARALLEL: '1' },
    timeout: Number(process.env.SKS_REAL_CODEX_PARALLEL_TIMEOUT_MS || 15 * 60 * 1000),
    maxBuffer: 1024 * 1024 * 32
  });
  if (run.status !== 0) {
    const report = {
      schema: 'sks.real-codex-parallel-gate.v1',
      ok: false,
      status: 'blocked',
      proof_level: 'blocked',
      requested_workers: workers,
      required,
      fixture_root: fixture,
      blockers: [`real_codex_parallel_command_exit_${run.status}`],
      stdout_tail: run.stdout.slice(-4000),
      stderr_tail: run.stderr.slice(-4000)
    };
    fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }
  const json = parseJson(run.stdout);
  const ledgerRoot = path.join(fixture, json.ledger_root || '');
  const mod = await importDist('core/agents/real-codex-parallel-proof.js');
  const proof = await mod.writeRealCodexParallelProof(ledgerRoot, { requestedWorkers: workers, required: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(proof, null, 2)}\n`);
  if (!proof.ok) {
    console.error(JSON.stringify({ ok: false, proof }, null, 2));
    process.exit(1);
  }
  emitGate(gate, { status: proof.status, requested_workers: workers, overlap: proof.max_observed_codex_child_process_overlap });
}

function parseJson(stdout) {
  const start = stdout.indexOf('{');
  const end = stdout.lastIndexOf('}');
  return JSON.parse(stdout.slice(start, end + 1));
}

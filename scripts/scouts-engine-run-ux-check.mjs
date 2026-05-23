#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { runFiveScoutFixture, runSksJson, missionDir, writeReport } from './scouts-1-14-1-lib.mjs';

const blockers = [];
const run = await runFiveScoutFixture({ engine: 'local-static', mock: true, writeCanonical: true, mode: 'engine-run-ux' });
const benchmarkId = 'engine-run-ux-fixture';
const benchDir = path.join(missionDir(run.mission_id), 'scout-benchmarks', benchmarkId);
await fs.mkdir(benchDir, { recursive: true });
await fs.writeFile(path.join(benchDir, 'scout-consensus.json'), `${JSON.stringify({ schema: 'sks.scout-consensus.v1', ok: true, mission_id: run.mission_id, engine_run_id: benchmarkId, findings: [{ id: 'engine-run-ux', claim: 'scoped' }] }, null, 2)}\n`);
await fs.writeFile(path.join(benchDir, 'scout-handoff.md'), '# Engine-run UX\n\nScoped handoff.\n');
await fs.writeFile(path.join(benchDir, 'scout-gate.json'), `${JSON.stringify({ schema: 'sks.scout-gate.v1', passed: true, mission_id: run.mission_id, engine_run_id: benchmarkId, completed_scouts: 5, blockers: [] }, null, 2)}\n`);
await fs.writeFile(path.join(benchDir, 'scout-proof-evidence.json'), `${JSON.stringify({ schema: 'sks.scout-proof-evidence.v2', gate: 'passed', mission_id: run.mission_id, engine_run_id: benchmarkId, scout_count: 5, completed_scouts: 5, read_only_confirmed: true }, null, 2)}\n`);

const status = await runSksJson(['scouts', 'status', run.mission_id, '--engine-runs', '--json']);
const consensus = await runSksJson(['scouts', 'consensus', run.mission_id, '--engine-run-id', benchmarkId, '--json']);
const handoff = await runSksJson(['scouts', 'handoff', run.mission_id, '--engine-run-id', benchmarkId, '--json']);
const validate = await runSksJson(['scouts', 'validate', run.mission_id, '--engine-run-id', benchmarkId, '--strict', '--json']);
const showRun = await runSksJson(['scouts', 'show-run', run.mission_id, '--engine-run-id', benchmarkId, '--json']);

if (!Array.isArray(status.engine_runs)) blockers.push('status_engine_runs_missing');
if (consensus.engine_run_id !== benchmarkId) blockers.push('consensus_engine_run_id_not_scoped');
if (!/Scoped handoff/.test(handoff.text || '')) blockers.push('handoff_not_scoped');
if (validate.ok !== true) blockers.push('validate_not_ok');
if (showRun.ok !== true || showRun.engine_run_id !== benchmarkId) blockers.push('show_run_not_ok');

await writeReport('scouts-engine-run-ux.json', {
  schema: 'sks.scouts-engine-run-ux.v1',
  ok: blockers.length === 0,
  mission_id: run.mission_id,
  engine_run_id: benchmarkId,
  blockers
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('Scout engine-run-id query selects benchmark consensus, handoff, and validate artifacts', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'scouts-engine-run-id-query', setup: false });
  const run = await runSksInRoot(root, ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json']);
  const missionDir = path.join(root, '.sneakoscope', 'missions', run.mission_id);
  const benchmarkDir = path.join(missionDir, 'scout-benchmarks', 'engine-run-real-1');
  await fs.mkdir(benchmarkDir, { recursive: true });

  await fs.writeFile(path.join(benchmarkDir, 'scout-consensus.json'), `${JSON.stringify({
    schema: 'sks.scout-consensus.v1',
    ok: true,
    mission_id: run.mission_id,
    engine_run_id: 'engine-run-real-1',
    source_policy: { mode: 'parsed_real_outputs' },
    findings: [{ id: 'real-only', claim: 'engine-run scoped consensus' }]
  }, null, 2)}\n`);
  await fs.writeFile(path.join(benchmarkDir, 'scout-handoff.md'), '# Engine Run Handoff\n\nengine-run scoped handoff\n');
  await fs.writeFile(path.join(benchmarkDir, 'scout-gate.json'), `${JSON.stringify({
    schema: 'sks.scout-gate.v1',
    passed: true,
    mission_id: run.mission_id,
    engine_run_id: 'engine-run-real-1',
    completed_scouts: 5,
    blockers: []
  }, null, 2)}\n`);
  await fs.writeFile(path.join(benchmarkDir, 'scout-proof-evidence.json'), `${JSON.stringify({
    schema: 'sks.scout-proof-evidence.v2',
    gate: 'passed',
    mission_id: run.mission_id,
    engine_run_id: 'engine-run-real-1',
    scout_count: 5,
    completed_scouts: 5,
    read_only_confirmed: true
  }, null, 2)}\n`);

  const consensus = await runSksInRoot(root, ['scouts', 'consensus', run.mission_id, '--engine-run-id', 'engine-run-real-1', '--json']);
  assert.equal(consensus.engine_run_id, 'engine-run-real-1');
  assert.equal(consensus.findings[0].id, 'real-only');

  const handoff = await runSksInRoot(root, ['scouts', 'handoff', run.mission_id, '--engine-run-id', 'engine-run-real-1', '--json']);
  assert.equal(handoff.engine_run_id, 'engine-run-real-1');
  assert.match(handoff.text, /engine-run scoped handoff/);

  const validation = await runSksInRoot(root, ['scouts', 'validate', run.mission_id, '--engine-run-id', 'engine-run-real-1', '--strict', '--json']);
  assert.equal(validation.engine_run_id, 'engine-run-real-1');
  assert.equal(validation.ok, true);
});

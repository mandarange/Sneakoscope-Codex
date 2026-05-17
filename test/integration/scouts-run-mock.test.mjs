import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from '../e2e/route-real-command-helper.mjs';

test('sks scouts run latest --engine local-static --mock --json generates five scout artifacts in a hermetic root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'scouts-run-mock', setup: false });
  const json = await runSksInRoot(root, ['scouts', 'run', 'latest', '--engine', 'local-static', '--mock', '--json']);
  assert.equal(json.scout_count, 5);
  assert.equal(json.engine, 'local-static');
  assert.equal(json.completed_scouts, 5);
  assert.equal(json.gate.passed, true);
  const dir = path.join(root, '.sneakoscope', 'missions', json.mission_id);
  await fs.access(path.join(dir, 'scout-team-plan.json'));
  await fs.access(path.join(dir, 'scout-consensus.json'));
  await fs.access(path.join(dir, 'scout-handoff.md'));
  await fs.access(path.join(dir, 'scout-gate.json'));
});

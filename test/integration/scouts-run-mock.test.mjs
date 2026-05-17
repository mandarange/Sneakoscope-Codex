import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../src/core/fsx.mjs';

test('sks scouts run latest --mock --json generates five scout artifacts', async () => {
  const result = await runProcess(process.execPath, [path.join(process.cwd(), 'bin/sks.mjs'), 'scouts', 'run', 'latest', '--mock', '--json'], {
    cwd: process.cwd(),
    timeoutMs: 30000,
    maxOutputBytes: 512 * 1024
  });
  assert.equal(result.code, 0, result.stderr || result.stdout);
  const json = JSON.parse(result.stdout);
  assert.equal(json.scout_count, 5);
  assert.equal(json.completed_scouts, 5);
  assert.equal(json.gate.passed, true);
  const dir = path.join(process.cwd(), '.sneakoscope', 'missions', json.mission_id);
  await fs.access(path.join(dir, 'scout-team-plan.json'));
  await fs.access(path.join(dir, 'scout-consensus.json'));
  await fs.access(path.join(dir, 'scout-handoff.md'));
  await fs.access(path.join(dir, 'scout-gate.json'));
});

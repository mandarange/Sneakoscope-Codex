import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { runFiveScoutIntake } from '../../src/core/scouts/scout-runner.mjs';

test('mock/static scout runs never allow real speedup claims', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-performance-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const result = await runFiveScoutIntake(root, {
    missionId: 'M-performance',
    route: '$Team',
    task: 'fixture',
    engine: 'local-static',
    mock: true
  });
  assert.equal(result.ok, true);
  assert.equal(result.performance.real_parallel, false);
  assert.equal(result.performance.claim_allowed, false);
});

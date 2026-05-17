import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { snapshotScoutReadableTree, assertScoutReadOnly } from '../../src/core/scouts/scout-readonly-guard.mjs';

test('scout read-only guard reports modified source paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-guard-int-'));
  await fs.writeFile(path.join(root, 'README.md'), 'before\n');
  const before = await snapshotScoutReadableTree(root, { missionId: 'M-int' });
  await fs.writeFile(path.join(root, 'README.md'), 'after\n');
  const guard = await assertScoutReadOnly(root, before, { missionId: 'M-int' });
  assert.equal(guard.passed, false);
  assert.deepEqual(guard.violations.map((v) => v.path), ['README.md']);
});

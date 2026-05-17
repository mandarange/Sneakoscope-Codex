import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { snapshotScoutReadableTree, assertScoutReadOnly } from '../../src/core/scouts/scout-readonly-guard.mjs';

test('scout read-only guard allows mission scout artifacts and blocks source edits', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-guard-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const before = await snapshotScoutReadableTree(root, { missionId: 'M-test' });
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-test'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-test', 'scout-gate.json'), '{}\n');
  let guard = await assertScoutReadOnly(root, before, { missionId: 'M-test' });
  assert.equal(guard.passed, true);
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"changed"}\n');
  guard = await assertScoutReadOnly(root, before, { missionId: 'M-test' });
  assert.equal(guard.passed, false);
  assert.equal(guard.violations[0].path, 'package.json');
});

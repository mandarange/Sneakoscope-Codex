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

test('scout read-only guard ignores volatile sks runtime state files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-guard-state-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  await fs.mkdir(path.join(root, '.sneakoscope', 'state'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'state', 'current.json.123.tmp'), '{}\n');
  const before = await snapshotScoutReadableTree(root, { missionId: 'M-test' });
  assert.equal(Object.hasOwn(before.entries, '.sneakoscope/state/current.json'), false);
  assert.equal(Object.hasOwn(before.entries, '.sneakoscope/state/current.json.123.tmp'), false);
});

test('scout read-only guard allows wrongness artifacts written by scout mismatch recording', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-guard-wrongness-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const before = await snapshotScoutReadableTree(root, { missionId: 'M-test' });
  await fs.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-test'), { recursive: true });
  await fs.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-test', 'wrongness-ledger.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-test', 'wrongness-summary.md'), '# summary\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'missions', 'M-test', 'wrongness-triwiki-links.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'wiki', 'wrongness-index.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'wiki', 'wrongness-ledger.json'), '{}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'wiki', 'wrongness-summary.md'), '# summary\n');
  const guard = await assertScoutReadOnly(root, before, { missionId: 'M-test' });
  assert.equal(guard.passed, true);
});

test('scout read-only guard ignores ambient artifacts from other sks missions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-scout-guard-ambient-'));
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  const before = await snapshotScoutReadableTree(root, { missionId: 'M-active' });

  const otherMission = path.join(root, '.sneakoscope', 'missions', 'M-other');
  await fs.mkdir(otherMission, { recursive: true });
  await fs.writeFile(path.join(otherMission, 'events.jsonl'), '{"type":"mission.created"}\n');
  await fs.writeFile(path.join(otherMission, 'context7-evidence.jsonl'), '{}\n');
  await fs.writeFile(path.join(otherMission, 'compliance-loop-guard.json'), '{}\n');

  const guard = await assertScoutReadOnly(root, before, { missionId: 'M-active' });
  assert.equal(guard.passed, true);
});

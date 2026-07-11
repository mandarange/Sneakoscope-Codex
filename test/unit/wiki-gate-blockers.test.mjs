import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { wikiGateBlockers } from '../../dist/core/commands/wiki-command.js';
import { evaluateGate } from '../../dist/core/stop-gate/gate-evaluator.js';

test('wiki gate blockers are empty on success and meaningful strings on failure', () => {
  assert.deepEqual(wikiGateBlockers(true, [{ id: 'ignored_stale_issue' }]), []);
  assert.deepEqual(wikiGateBlockers(false, [
    { id: 'schema_mismatch', severity: 'error' },
    { id: 'duplicate_anchor', severity: 'error', anchor: 'wiki-memory' },
    ' vx_missing ',
    { id: 'duplicate_anchor', severity: 'error', anchor: 'wiki-memory' }
  ]), [
    'schema_mismatch',
    'duplicate_anchor:wiki-memory',
    'vx_missing'
  ]);
  assert.deepEqual(wikiGateBlockers(false, [], 'wiki_image_ingest_validation_failed'), ['wiki_image_ingest_validation_failed']);
});

test('wiki gate blocker arrays satisfy the shared gate evaluator contract', async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wiki-gate-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const missionId = 'M-wiki-gate-contract';
  const dir = path.join(root, '.sneakoscope', 'missions', missionId);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(path.join(dir, 'wiki-gate.json'), JSON.stringify({
    passed: true,
    ok: true,
    blockers: wikiGateBlockers(true)
  }));
  const success = await evaluateGate(root, missionId, 'wiki-gate.json');
  assert.equal(success.pass, true);
  assert.deepEqual(success.reasons, []);

  await fs.writeFile(path.join(dir, 'wiki-gate.json'), JSON.stringify({
    passed: false,
    ok: false,
    blockers: wikiGateBlockers(false, [{ id: 'schema_mismatch' }])
  }));
  const failure = await evaluateGate(root, missionId, 'wiki-gate.json');
  assert.equal(failure.pass, false);
  assert.ok(failure.reasons.includes('gate_blockers_present'));
  assert.ok(!failure.reasons.includes('gate_blockers_not_array'));
});

import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import test from 'node:test';

test('automatic wrongness sources cover test, DB, hook, and image validation failures', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-auto-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-auto'), { recursive: true });
  const ledger = await import('../../dist/core/triwiki-wrongness/wrongness-ledger.js');
  const image = await import('../../dist/core/triwiki-wrongness/image-wrongness.js');

  await ledger.recordTestFailureWrongness(root, { mission_id: 'M-auto', command: 'npm test', failure: 'fixture failed' });
  await ledger.recordDbSafetyMismatchWrongness(root, { mission_id: 'M-auto', expected: 'safe', actual: 'blocked', command: 'sks db check' });
  await ledger.recordHookPolicyMismatchWrongness(root, { mission_id: 'M-auto', expected: 'block', actual: 'continue' });
  await ledger.recordAgentMismatchWrongness(root, { mission_id: 'M-auto', agent_id: 'agent-2-verification', issues: ['parse_failed'] });
  await image.recordImageWrongnessFromValidation(root, {
    missionId: 'M-auto',
    validation: { ok: false, issues: ['missing_anchors:$Wiki', 'bbox_out_of_bounds:anchor-001'] },
    artifact: '.sneakoscope/missions/M-auto/image-voxel-ledger.json'
  });

  const combined = await ledger.readCombinedWrongnessRecords(root, 'M-auto');
  const kinds = new Set(combined.map((record) => record.wrongness_kind));
  assert.ok(kinds.has('test_failure'));
  assert.ok(kinds.has('db_safety_false_positive'));
  assert.ok(kinds.has('hook_policy_mismatch'));
  assert.ok(kinds.has('agent_output_error'));
  assert.ok(kinds.has('visual_anchor_error'));
  assert.ok(kinds.has('image_bbox_error'));
});

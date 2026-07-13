import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import test from 'node:test';

test('wrongness ledger records, validates, summarizes, and resolves negative evidence', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-ledger-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-ledger'), { recursive: true });
  await fsp.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-other'), { recursive: true });
  const ledger = await import('../../dist/core/triwiki-wrongness/wrongness-ledger.js');
  const proofLinker = await import('../../dist/core/triwiki-wrongness/wrongness-proof-linker.js');

  const added = await ledger.addWrongnessRecord(root, {
    mission_id: 'M-ledger',
    route: '$Team',
    wrongness_kind: 'incorrect_claim',
    claim: { text: 'This claim was wrong.' },
    root_cause: { category: 'bad_source', explanation: 'Fixture used a bad source.' },
    corrective_action: { summary: 'Use source-backed evidence.', required_evidence: ['fixture'], patch_status: 'pending' },
    avoidance_rule: { text: 'Do not reuse fixture claims without source evidence.', applies_to: ['$Team'], severity: 'medium' }
  });

  assert.match(added.record.id, /^WRONG-/);
  const validation = await ledger.validateWrongnessScope(root, 'latest');
  assert.equal(validation.ok, true);
  assert.equal(validation.checked, 2);

  const summary = await ledger.summarizeWrongness(root, 'M-ledger');
  assert.equal(summary.active, 1);
  assert.equal(summary.medium_severity_active, 1);

  await ledger.addWrongnessRecord(root, {
    mission_id: 'M-other',
    wrongness_kind: 'missing_evidence',
    severity: 'high',
    claim: { text: 'An unrelated mission remains blocked.' }
  });
  const isolated = await ledger.summarizeWrongness(root, 'M-ledger');
  assert.equal(isolated.active, 1);
  assert.equal(isolated.high_severity_active, 0);

  await ledger.addWrongnessRecord(root, {
    wrongness_kind: 'stale_evidence',
    severity: 'medium',
    route: '$Team',
    claim: { text: 'A project-global Team avoidance rule remains active.' }
  });
  const inheritedGlobal = await ledger.summarizeWrongness(root, 'M-ledger');
  assert.equal(inheritedGlobal.active, 2);
  const proof = await proofLinker.wrongnessProofEvidence(root, 'M-ledger', { route: '$Team' });
  assert.equal(proof.active_count, 2);
  assert.equal(proof.active_ids.includes(added.record.id), true);

  const resolved = await ledger.resolveWrongnessRecord(root, added.record.id, 'Fixture resolved');
  assert.equal(resolved.updated, 2);

  const falseAlarm = await ledger.addWrongnessRecord(root, {
    wrongness_kind: 'overconfident_claim',
    claim: { text: 'This was later classified as a false alarm.' }
  });
  const marked = await ledger.resolveWrongnessRecord(root, falseAlarm.record.id, 'Not a real blocker', 'false_alarm');
  assert.equal(marked.records.at(-1).status, 'false_alarm');
});

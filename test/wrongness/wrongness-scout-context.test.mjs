import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import test from 'node:test';

test('wrongness retrieval exposes active avoidance rules to scouts', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-wrongness-context-'));
  const ledger = await import('../../dist/core/triwiki-wrongness/wrongness-ledger.js');
  const retrieval = await import('../../dist/core/triwiki-wrongness/wrongness-retrieval.js');

  await ledger.addWrongnessRecord(root, {
    route: '$Team',
    wrongness_kind: 'db_safety_false_negative',
    severity: 'high',
    claim: { text: 'DB policy allowed an unsafe mutation.' },
    root_cause: { category: 'missing_db_policy', explanation: 'Fixture policy mismatch.' },
    corrective_action: { summary: 'Update DB safety policy.', patch_status: 'pending' },
    avoidance_rule: { text: 'DB scouts must treat this mutation pattern as blocked.', applies_to: ['$Team', 'db'], severity: 'high' }
  });

  const context = await retrieval.wrongnessContextForRoute(root, { route: '$Team' });
  assert.equal(context.active_records.length, 1);
  const refs = retrieval.scoutWrongnessReferences(context, 'scout-3-safety-db');
  assert.equal(refs.length, 1);
});

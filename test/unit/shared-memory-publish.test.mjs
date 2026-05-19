import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { publishSharedMemory, validateSharedMemory } from '../../dist/core/git-hygiene/shared-memory-publish.js';
import { addWrongnessRecord } from '../../dist/core/triwiki-wrongness/wrongness-ledger.js';

test('shared memory publish writes deterministic claim and wrongness shards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-shared-publish-'));
  await fs.mkdir(path.join(root, '.sneakoscope', 'wiki'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture"}\n');
  await fs.writeFile(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), JSON.stringify({
    schema: 'fixture',
    claims: [{ id: 'claim-alpha', text: 'Shared TriWiki claim alpha.', status: 'supported', source: 'docs/shared-triwiki.md' }]
  }, null, 2));
  await addWrongnessRecord(root, {
    id: 'WRONG-SHARED-ALPHA',
    wrongness_kind: 'incorrect_claim',
    claim: { text: 'Do not reuse unsupported shared claims.' },
    root_cause: { category: 'bad_source', explanation: 'Fixture negative evidence.' },
    corrective_action: { summary: 'Hydrate from source.', patch_status: 'pending' },
    avoidance_rule: { text: 'Hydrate shared claims before reuse.' }
  });

  const published = await publishSharedMemory(root, { target: 'all' });
  assert.equal(published.ok, true);
  assert.ok(published.written.some((file) => file.includes('/records/claims/claim-alpha.json')));
  assert.ok(published.written.some((file) => file.includes('/wrongness/wrong-shared-alpha.json')));

  const validation = await validateSharedMemory(root);
  assert.equal(validation.ok, true);
  assert.ok(validation.files.includes('.sneakoscope/git-policy.json'));
});

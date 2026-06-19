import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGlmNarutoRequirementLedger } from '../glm-naruto-requirement-ledger.js';

test('requirement ledger extracts preserve and only clauses', () => {
  const ledger = buildGlmNarutoRequirementLedger({
    missionId: 'M-test',
    task: 'Only change src/a.ts. Preserve src/b.ts behavior.',
    mentionedPaths: ['src/a.ts', 'src/b.ts']
  });
  assert.equal(ledger.schema, 'sks.glm-naruto-requirement-ledger.v1');
  assert.ok(ledger.requirements.some((req) => /Only change/.test(req.text)));
  assert.ok(ledger.requirements.some((req) => /Preserve/.test(req.text)));
});

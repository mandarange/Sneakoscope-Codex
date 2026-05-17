import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeCompletionProof } from '../../src/core/proof/proof-writer.mjs';
import { readLatestProof } from '../../src/core/proof/proof-reader.mjs';
import { validateCompletionProof } from '../../src/core/proof/validation.mjs';

test('proof engine writes latest json and markdown', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-proof-'));
  const written = await writeCompletionProof(root, { route: '$Team', status: 'verified_partial' });
  assert.equal(written.ok, true);
  const proof = await readLatestProof(root);
  assert.equal(proof.route, '$Team');
  assert.equal(validateCompletionProof(proof).ok, true);
});

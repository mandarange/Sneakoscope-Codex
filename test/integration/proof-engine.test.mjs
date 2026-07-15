import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeCompletionProof } from '../../dist/core/proof/proof-writer.js';
import { readLatestProof } from '../../dist/core/proof/proof-reader.js';
import { validateCompletionProof } from '../../dist/core/proof/validation.js';

test('proof engine writes latest json and markdown', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-proof-'));
  const written = await writeCompletionProof(root, { route: '$Wiki', status: 'verified_partial' });
  assert.equal(written.ok, true);
  const proof = await readLatestProof(root);
  assert.equal(proof.route, '$Wiki');
  assert.equal(validateCompletionProof(proof).ok, true);
});

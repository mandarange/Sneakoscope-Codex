import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeWikiContextPack } from '../commands/wiki-command.js';

test('context pack hydrates only code entries selected by bounded attention', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-wiki-context-bounds-'));
  try {
    const dir = path.join(root, '.sneakoscope', 'wiki');
    await fs.mkdir(dir, { recursive: true });
    const entries = Array.from({ length: 30 }, (_, index) => ({
      id: `code:module-${String(index).padStart(2, '0')}`,
      text: `module ${index} source-backed summary`,
      citations: [{ path: `src/module-${index}.ts` }],
      trust_score: 0.9,
      token_cost: 100
    }));
    await fs.writeFile(path.join(dir, 'code-pack.json'), `${JSON.stringify({ schema: 'sks.code-pack.v1', entries }, null, 2)}\n`);

    const { pack } = await writeWikiContextPack(root, [], { dryRun: true });
    const referencedCodeIds = new Set([
      ...pack.attention.use_first,
      ...pack.attention.hydrate_first
    ].map((row: any) => row[0]).filter((id: string) => id.startsWith('code:')));
    const hydratedCodeClaims = pack.claims.filter((claim: any) => String(claim.id).startsWith('code:'));
    assert.equal(referencedCodeIds.size, 20);
    assert.equal(hydratedCodeClaims.length, 20);
    assert.deepEqual(new Set(hydratedCodeClaims.map((claim: any) => claim.id)), referencedCodeIds);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

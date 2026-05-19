import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { installGitignoreBlock } from '../../dist/core/git-hygiene/gitignore-writer.js';

test('gitignore writer removes broad .sneakoscope ignore and preserves shared shards', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-gitignore-'));
  await fs.writeFile(path.join(root, '.gitignore'), 'node_modules/\n.sneakoscope/\n');
  const result = await installGitignoreBlock(root);
  const text = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
  assert.equal(result.changed, true);
  assert.equal(text.split(/\r?\n/).some((line) => line.trim() === '.sneakoscope/'), false);
  assert.match(text, /\.sneakoscope\/missions\//);
  assert.match(text, /\.sneakoscope\/wiki\/wrongness-summary\.md/);
  assert.match(text, /Shared SKS memory records are intentionally tracked/);
});

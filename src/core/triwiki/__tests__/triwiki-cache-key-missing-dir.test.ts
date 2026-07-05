import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { computeTriWikiCacheKey, collectInputFiles } from '../triwiki-cache-key.js';

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'sks-triwiki-cache-key-'));
}

test('computeTriWikiCacheKey does not throw when an input pattern points at a nonexistent directory', () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  assert.doesNotThrow(() => {
    const result = computeTriWikiCacheKey({
      root,
      id: 'triwiki:cache-key-missing-dir-test',
      inputs: ['.agents/skills/db/agents', 'package.json']
    });
    assert.equal(typeof result.key, 'string');
    assert.ok(result.key.length > 0);
    assert.ok(result.missing_inputs.includes('.agents/skills/db/agents'));
  });
});

test('collectInputFiles treats a missing directory as contributing zero files, not an error', () => {
  const root = makeRoot();
  const { records, missing, unsupported } = collectInputFiles(root, ['nested/does/not/exist']);
  assert.deepEqual(records, []);
  assert.deepEqual(missing, ['nested/does/not/exist']);
  assert.deepEqual(unsupported, []);
});

test('collectInputFiles still walks an existing directory alongside a missing glob sibling', () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, 'real-dir'), { recursive: true });
  fs.writeFileSync(path.join(root, 'real-dir', 'a.txt'), 'hello');
  const { records, missing } = collectInputFiles(root, ['real-dir', 'ghost-dir']);
  assert.equal(records.length, 1);
  assert.equal(records[0]?.path, 'real-dir/a.txt');
  assert.deepEqual(missing, ['ghost-dir']);
});

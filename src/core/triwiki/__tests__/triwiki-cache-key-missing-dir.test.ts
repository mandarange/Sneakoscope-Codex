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

test('cache key hashes every byte of large inputs, including regions outside the old sample windows', () => {
  const root = makeRoot();
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  const file = path.join(root, 'large.bin');
  const content = Buffer.alloc(1024 * 1024, 0x61);
  fs.writeFileSync(file, content);
  const before = computeTriWikiCacheKey({ root, id: 'large-input', inputs: ['large.bin'] });
  content[300_000] = 0x62;
  fs.writeFileSync(file, content);
  const after = computeTriWikiCacheKey({ root, id: 'large-input', inputs: ['large.bin'] });
  assert.notEqual(after.input_hash, before.input_hash);
  assert.notEqual(after.key, before.key);
});

test('double-star globs include nested files and skip hidden worktree copies', () => {
  const root = makeRoot();
  fs.mkdirSync(path.join(root, 'src', 'core', 'nested'), { recursive: true });
  fs.mkdirSync(path.join(root, '.claude', 'worktrees', 'copy', 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'top.ts'), 'top\n');
  fs.writeFileSync(path.join(root, 'src', 'core', 'nested', 'deep.ts'), 'deep\n');
  fs.writeFileSync(path.join(root, '.claude', 'worktrees', 'copy', 'src', 'shadow.ts'), 'shadow\n');

  const result = collectInputFiles(root, ['src/**']);
  assert.deepEqual(result.records.map((record) => record.path), ['src/core/nested/deep.ts', 'src/top.ts']);
  assert.deepEqual(result.missing, []);
})

test('cache inputs reject paths outside the project and non-regular devices without reading them', () => {
  const root = makeRoot();
  const result = collectInputFiles(root, ['../../../../../etc/hosts', '/dev/zero']);
  assert.deepEqual(result.records, []);
  assert.equal(result.unsupported.length, 2);
  assert.ok(result.unsupported.every((value) => value.startsWith('outside_root_or_unsafe_input:')));
})

test('cache inputs reject external files reached through an intermediate symlink', () => {
  const root = makeRoot();
  const victim = makeRoot();
  fs.mkdirSync(path.join(victim, 'nested'), { recursive: true });
  fs.writeFileSync(path.join(victim, 'nested', 'secret.ts'), 'external secret\n');
  fs.symlinkSync(victim, path.join(root, 'linked'));

  const literal = collectInputFiles(root, ['linked/nested/secret.ts']);
  const literalDirectory = collectInputFiles(root, ['linked/nested']);
  const glob = collectInputFiles(root, ['linked/nested/**/*.ts']);

  assert.deepEqual(literal.records, []);
  assert.ok(literal.unsupported.some((value) => value.includes('symlink_escape_or_unsafe_input')));
  assert.deepEqual(literalDirectory.records, []);
  assert.deepEqual(glob.records, []);
})

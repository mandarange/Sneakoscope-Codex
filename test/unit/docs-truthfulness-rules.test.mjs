import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('docs truthfulness check covers release wording', () => {
  const result = spawnSync(process.execPath, ['scripts/docs-truthfulness-check.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8'
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const json = JSON.parse(result.stdout);
  assert.equal(json.schema, 'sks.docs-truthfulness-check.v1');
  assert.equal(json.ok, true);
});

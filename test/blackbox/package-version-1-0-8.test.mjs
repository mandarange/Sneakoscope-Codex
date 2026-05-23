import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('package metadata is 1.15.0', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.version, '1.15.0');
});

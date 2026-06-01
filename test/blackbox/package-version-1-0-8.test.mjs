import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('package metadata is the current stable release', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert.equal(pkg.version, '1.20.4');
});

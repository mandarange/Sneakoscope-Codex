import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decideDfixPath } from '../../dist/core/dfix/path-decision.js';

test('DFix path decision chooses L0, L2, and L3 appropriately', () => {
  assert.equal(decideDfixPath({ file: 'src/a.ts', findText: 'a', replaceText: 'b' }).path, 'L0');
  assert.equal(decideDfixPath({ signature: { error_kind: 'generic' } }).path, 'L2');
  assert.equal(decideDfixPath({ file: '.env', signature: { error_kind: 'generic' } }).path, 'L3');
});

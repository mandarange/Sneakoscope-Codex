import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validatePatchSafety } from '../../dist/core/dfix/patch-runner.js';

test('DFix patch runner blocks secret, generated, and binary files', () => {
  assert.equal(validatePatchSafety(process.cwd(), { file: '.env' }).ok, false);
  assert.equal(validatePatchSafety(process.cwd(), { file: 'dist/index.js' }).ok, false);
  assert.equal(validatePatchSafety(process.cwd(), { file: 'docs/logo.png' }).ok, false);
  assert.equal(validatePatchSafety(process.cwd(), { file: 'src/core/dfix.ts' }).ok, true);
});

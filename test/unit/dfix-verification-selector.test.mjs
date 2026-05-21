import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildDfixVerificationSelection } from '../../dist/core/dfix/verification-selector.js';

test('DFix verification selector prioritizes DFix fixture for DFix source changes', async () => {
  const selection = await buildDfixVerificationSelection(process.cwd(), { changedFiles: ['src/core/dfix/error-signature.ts'] });
  assert.equal(selection.fastest_sufficient_command, 'npm run dfix:fixture');
  assert.equal(selection.confidence >= 0.8, true);
});

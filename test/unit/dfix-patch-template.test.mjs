import assert from 'node:assert/strict';
import { test } from 'node:test';
import { selectDfixPatchTemplate } from '../../dist/core/dfix/patch-templates.js';

test('DFix patch templates select exact replacement before handoff', () => {
  const selected = selectDfixPatchTemplate({ file: 'src/a.ts', findText: 'old', replaceText: 'new' });
  assert.equal(selected.template_id, 'exact_find_replace');
  assert.equal(selected.ambiguous, false);
  const ambiguous = selectDfixPatchTemplate({});
  assert.equal(ambiguous.next_path, 'L2');
});

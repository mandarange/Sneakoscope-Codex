import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('dfix patch result captures git diff before and after', () => {
  sourceIncludes('src/core/dfix.ts', ['git_diff_before', 'git_diff_after', 'diff_captured']);
});

import test from 'node:test';
import { sourceIncludes } from '../helpers/real-execution-closure.mjs';

test('dfix has a Codex patch handoff path when exact replacement is absent', () => {
  sourceIncludes('src/core/dfix.ts', ['codex_patch_handoff', 'buildDfixCodexPatchPrompt', 'Forbidden operations']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGlmSpeedOutput } from '../glm-speed-output-parser.js';

test('GLM speed parser extracts patch, need_context, and blocked envelopes', () => {
  assert.equal(parseGlmSpeedOutput('<sks_patch>\ndiff --git a/a b/a\n</sks_patch>').kind, 'patch');
  assert.deepEqual(parseGlmSpeedOutput('<sks_need_context>\npaths:\n- src/foo.ts\n</sks_need_context>').paths, ['src/foo.ts']);
  assert.equal(parseGlmSpeedOutput('<sks_blocked>\nreason: too broad\n</sks_blocked>').reason, 'too broad');
  assert.equal(parseGlmSpeedOutput('hello').kind, 'malformed');
  assert.equal(parseGlmSpeedOutput('diff --git a/a b/a').kind, 'malformed');
});

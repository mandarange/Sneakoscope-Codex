import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCompactContinue,
  buildPermissionRequestAllow,
  buildPermissionRequestDeny,
  buildPostToolUseBlock,
  buildPostToolUseContinue,
  buildPreToolUseAllowRewrite,
  buildPreToolUseContinue,
  buildPreToolUseDeny,
  buildSessionStartContinue,
  buildStopBlock,
  buildStopContinue,
  buildSubagentStartContinue,
  buildSubagentStopBlock,
  buildSubagentStopContinue,
  buildUserPromptSubmitBlock,
  buildUserPromptSubmitContinue
} from '../../dist/core/codex-compat/codex-hook-output-builders.js';
import { validateCodexHookOutput } from '../../dist/core/codex-compat/codex-hook-schema.js';
import { validateCodexHookSemanticOutput } from '../../dist/core/codex-compat/codex-hook-semantic-validator.js';

const cases = [
  ['PreToolUse', buildPreToolUseContinue()],
  ['PreToolUse', buildPreToolUseContinue({ additionalContext: 'context' })],
  ['PreToolUse', buildPreToolUseDeny('blocked')],
  ['PreToolUse', buildPreToolUseAllowRewrite({ command: 'npm test' })],
  ['PermissionRequest', buildPermissionRequestAllow()],
  ['PermissionRequest', buildPermissionRequestDeny('blocked')],
  ['PostToolUse', buildPostToolUseContinue({ additionalContext: 'context' })],
  ['PostToolUse', buildPostToolUseBlock('blocked')],
  ['UserPromptSubmit', buildUserPromptSubmitContinue({ additionalContext: 'context' })],
  ['UserPromptSubmit', buildUserPromptSubmitBlock('blocked')],
  ['Stop', buildStopContinue()],
  ['Stop', buildStopBlock('blocked')],
  ['PreCompact', buildCompactContinue('PreCompact')],
  ['PostCompact', buildCompactContinue('PostCompact')],
  ['SessionStart', buildSessionStartContinue({ additionalContext: 'context' })],
  ['SubagentStart', buildSubagentStartContinue({ additionalContext: 'context' })],
  ['SubagentStop', buildSubagentStopContinue()],
  ['SubagentStop', buildSubagentStopBlock('blocked')]
];

test('hook output builders emit schema-valid and semantic-valid canonical output', async () => {
  for (const [event, output] of cases) {
    assert.equal((await validateCodexHookOutput(event, output)).ok, true, event);
    assert.equal(validateCodexHookSemanticOutput(event, output).ok, true, event);
    assert.deepEqual(findSnakeCaseKeys(output), [], event);
  }
});

test('hook output builders reject empty required reasons', () => {
  assert.throws(() => buildPreToolUseDeny(''));
  assert.throws(() => buildPermissionRequestDeny(''));
  assert.throws(() => buildPostToolUseBlock(''));
  assert.throws(() => buildUserPromptSubmitBlock(''));
  assert.throws(() => buildStopBlock(''));
  assert.throws(() => buildSubagentStopBlock(''));
  assert.throws(() => buildPreToolUseAllowRewrite(undefined));
});

function findSnakeCaseKeys(value, out = []) {
  if (!value || typeof value !== 'object') return out;
  for (const [key, child] of Object.entries(value)) {
    if (key !== 'updatedInput' && /_/.test(key)) out.push(key);
    if (key !== 'updatedInput') findSnakeCaseKeys(child, out);
  }
  return out;
}

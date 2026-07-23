import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import {
  attachOfficialSubagentSpawnCompatibilityContext,
  hookActiveSkillContextRefresh,
  officialSubagentSpawnCompatibilityContext
} from '../hook-context.js';
import { normalizeHookResult } from '../hook-io.js';
import { validateCodexHookOutput } from '../../codex-compat/codex-hook-schema.js';
import { validateSubagentStartSemanticOutput } from '../../codex-compat/codex-hook-semantic-validator.js';
import { agentsBlockText, codexAppQuickReference } from '../../init.js';

test('Naruto parent context rejects full-history forks when custom spawn metadata is selected', () => {
  const result: any = attachOfficialSubagentSpawnCompatibilityContext(
    {},
    { prompt: '$sks-naruto implement two independent slices' },
    { continue: true, additionalContext: 'route context' }
  );

  assert.equal(result.additionalContext.startsWith(officialSubagentSpawnCompatibilityContext()), true);
  assert.match(result.additionalContext, /fork_turns="all"/);
  assert.match(result.additionalContext, /fork_turns="none"/);
  assert.match(result.additionalContext, /positive bounded turn count/);
  assert.match(result.additionalContext, /complete bounded slice contract in `message`/);
  assert.ok(result.additionalContext.indexOf('spawn compatibility') < result.additionalContext.indexOf('route context'));
});

test('compact-resume SessionStart restores the spawn compatibility rule for an active subagent mission', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-subagent-context-resume-'));
  try {
    const result: any = await hookActiveSkillContextRefresh(root, {
      mission_id: 'M-subagent-context-resume',
      route_closed: false,
      subagents_required: true
    }, 'session-start');
    const output: any = normalizeHookResult('session-start', result);

    assert.equal(result.silent, true);
    assert.match(String(output.hookSpecificOutput?.additionalContext || ''), /fork_turns="none"/);
    assert.equal((await validateCodexHookOutput('SessionStart', output)).ok, true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('SubagentStart context stays in hookSpecificOutput and remains schema-valid above the spill threshold', async () => {
  const context = `bounded child context\n${'x'.repeat(16_000)}`;
  const output: any = normalizeHookResult('subagent-start', {
    continue: true,
    additionalContext: context,
    silent: true
  });

  assert.equal(Object.prototype.hasOwnProperty.call(output, 'additionalContext'), false);
  assert.equal(output.hookSpecificOutput?.hookEventName, 'SubagentStart');
  assert.equal(output.hookSpecificOutput?.additionalContext, context);
  assert.equal((await validateCodexHookOutput('SubagentStart', output)).ok, true);
  assert.equal(validateSubagentStartSemanticOutput(output).ok, true);
});

test('generated Codex guidance persists the full-history fork constraint', () => {
  for (const text of [agentsBlockText(), codexAppQuickReference('global', 'sks')]) {
    assert.match(text, /Codex 0\.145/);
    assert.match(text, /fork_turns="all"/);
    assert.match(text, /fork_turns="none"/);
    assert.match(text, /positive bounded turn count/);
    assert.match(text, /complete bounded slice contract/);
  }
});

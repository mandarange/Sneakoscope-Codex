import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentCommandArgs } from '../../dist/core/agents/agent-command-surface.js';

test('agent command parser forwards real backend flags without leaking option values into prompt', () => {
  const parsed = parseAgentCommandArgs('agent', [
    'run',
    'fixture task',
    '--backend',
    'codex-exec',
    '--agents',
    '1',
    '--concurrency',
    '1',
    '--real',
    '--json'
  ]);

  assert.equal(parsed.action, 'run');
  assert.equal(parsed.prompt, 'fixture task');
  assert.equal(parsed.backend, 'codex-exec');
  assert.equal(parsed.agents, 1);
  assert.equal(parsed.concurrency, 1);
  assert.equal(parsed.real, true);
  assert.equal(parsed.mock, false);
  assert.equal(parsed.json, true);
});

test('agent command parser keeps patch entry id out of rollback prompt positionals', () => {
  const parsed = parseAgentCommandArgs('agent', [
    'rollback-patches',
    'latest',
    '--patch-entry-id',
    'entry-a',
    '--apply',
    '--json'
  ]);

  assert.equal(parsed.action, 'rollback-patches');
  assert.equal(parsed.missionId, 'latest');
  assert.equal(parsed.patchEntryId, 'entry-a');
  assert.equal(parsed.apply, true);
  assert.equal(parsed.prompt, 'Native agent run');
});

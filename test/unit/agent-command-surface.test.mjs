import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAgentCommandArgs, resolveZellijVisiblePaneCap } from '../../dist/core/agents/agent-command-surface.js';

test('agent command parser forwards real backend flags without leaking option values into prompt', () => {
  const parsed = parseAgentCommandArgs('agent', [
    'run',
    'fixture task',
    '--backend',
    'codex-sdk',
    '--agents',
    '1',
    '--concurrency',
    '1',
    '--real',
    '--json'
  ]);

  assert.equal(parsed.action, 'run');
  assert.equal(parsed.prompt, 'fixture task');
  assert.equal(parsed.backend, 'codex-sdk');
  assert.equal(parsed.backendExplicit, true);
  assert.equal(parsed.agents, 1);
  assert.equal(parsed.concurrency, 1);
  assert.equal(parsed.real, true);
  assert.equal(parsed.mock, false);
  assert.equal(parsed.json, true);
});

test('agent command parser marks default backend as implicit', () => {
  const parsed = parseAgentCommandArgs('agent', [
    'run',
    'simple code write only',
    '--agents',
    '1',
    '--json'
  ]);

  assert.equal(parsed.backend, 'codex-sdk');
  assert.equal(parsed.backendExplicit, false);
});

test('agent command parser separates local model from Ollama protocol backend', () => {
  const local = parseAgentCommandArgs('agent', [
    'run',
    'simple local task',
    '--local-model',
    '--json'
  ]);
  assert.equal(local.backend, 'local-llm');
  assert.equal(local.backendExplicit, true);
  assert.equal(local.ollamaEnabled, true);

  const ollama = parseAgentCommandArgs('agent', [
    'run',
    'simple ollama task',
    '--ollama',
    '--json'
  ]);
  assert.equal(ollama.backend, 'ollama');
  assert.equal(ollama.backendExplicit, true);
  assert.equal(ollama.ollamaEnabled, true);
});

test('agent command parser defaults zellij worker panes to a readable adaptive cap', () => {
  const oldColumns = process.env.SKS_ZELLIJ_TERMINAL_COLUMNS;
  const oldFallback = process.env.SKS_ZELLIJ_UNKNOWN_VISIBLE_PANE_CAP;
  try {
    process.env.SKS_ZELLIJ_TERMINAL_COLUMNS = '360';
    assert.equal(resolveZellijVisiblePaneCap('', false), 3);
    assert.equal(resolveZellijVisiblePaneCap('7', true), 7);
    process.env.SKS_ZELLIJ_TERMINAL_COLUMNS = '';
    process.env.SKS_ZELLIJ_UNKNOWN_VISIBLE_PANE_CAP = '2';
    assert.equal(resolveZellijVisiblePaneCap('', false), 2);
  } finally {
    if (oldColumns === undefined) delete process.env.SKS_ZELLIJ_TERMINAL_COLUMNS;
    else process.env.SKS_ZELLIJ_TERMINAL_COLUMNS = oldColumns;
    if (oldFallback === undefined) delete process.env.SKS_ZELLIJ_UNKNOWN_VISIBLE_PANE_CAP;
    else process.env.SKS_ZELLIJ_UNKNOWN_VISIBLE_PANE_CAP = oldFallback;
  }
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

test('agent cleanup parser preserves an explicit zero stale threshold', () => {
  const parsed = parseAgentCommandArgs('agent', ['cleanup', 'M-stale', '--stale-ms', '0', '--apply']);
  assert.equal(parsed.staleMs, 0);
});

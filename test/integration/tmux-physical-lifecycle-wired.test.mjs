import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('orchestrator wires tmux physical proof lifecycle phases', () => {
  const text = fs.readFileSync('src/core/agents/agent-orchestrator.ts', 'utf8');
  assert.match(text, /writeTmuxPhysicalProof/);
  assert.match(text, /phase: 'initial'/);
  assert.match(text, /phase: 'before_drain'/);
  assert.match(text, /phase: 'after_drain'/);
  assert.match(text, /phase: 'final'/);
});

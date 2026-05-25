import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeAgentOrchestrator } from '../../dist/core/agents/agent-orchestrator.js';

test('native fake agent run writes terminal close reports', async () => {
  const result = await runNativeAgentOrchestrator({ prompt: 'terminal close fixture', agents: 2, concurrency: 2, mock: true, backend: 'fake' });
  assert.equal(result.ok, true);
  assert.equal(result.proof.terminal_sessions_closed, true);
  assert.equal(result.proof.terminal_session_count, 2);
});

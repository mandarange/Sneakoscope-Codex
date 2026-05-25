import test from 'node:test';
import assert from 'node:assert/strict';
import { runNativeAgentOrchestrator } from '../../dist/core/agents/agent-orchestrator.js';

test('native agent run writes tmux right lane manifest', async () => {
  const result = await runNativeAgentOrchestrator({ prompt: 'tmux lane fixture', agents: 3, concurrency: 3, mock: true, backend: 'fake' });
  assert.equal(result.proof.tmux_lane_manifest_ok, true);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { runAdhdOrchestratingGate, buildDopamineOrchestrationArtifacts } from '../../dist/core/strategy/adhd-orchestrating-gate.js';

test('ADHD orchestrating gate builds micro-wins before scheduler work', () => {
  const gate = runAdhdOrchestratingGate({ prompt: 'Patch `src/core/version.ts` and verify Appshots UI proof.', agentCount: 5 });
  const artifacts = buildDopamineOrchestrationArtifacts(gate);
  assert.equal(gate.ok, true);
  assert.equal(gate.scheduler_requires_gate, true);
  assert.ok(gate.micro_wins.length >= 4);
  assert.equal(artifacts.microWinBoard.summary_available, true);
});

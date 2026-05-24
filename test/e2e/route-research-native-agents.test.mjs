import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('Research prepare/status expose native agent sessions and batches', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'research-native-agents' });
  const prepared = await runSksInRoot(root, ['research', 'prepare', 'native research batch fixture', '--json']);
  assert.equal(prepared.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(prepared.native_agent_plan.legacy_runtime, false);
  assert.ok(prepared.native_agent_plan.personas.some((persona) => persona.id === 'research_source_miner'));
  assert.ok(prepared.native_agent_plan.personas.some((persona) => persona.id === 'research_skeptic'));
  assert.ok(prepared.native_agent_plan.personas.some((persona) => persona.id === 'research_synthesis'));
  assert.ok(prepared.native_agent_plan.personas.some((persona) => persona.id === 'research_verifier'));
  await fs.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'agents', 'agent-events.jsonl'));

  const run = await runSksInRoot(root, ['research', 'run', prepared.mission_id, '--mock', '--json']);
  assert.equal(run.ok, true);
  assert.ok(run.agent_batches.some((batch) => batch.id === 'research-source-mining-batch'));

  const status = await runSksInRoot(root, ['research', 'status', prepared.mission_id]);
  assert.equal(status.agent_backend, 'native_multi_session_agent_kernel');
  assert.equal(status.agent_sessions.research_source_miner.status, 'closed');
  assert.ok(status.agent_batches.some((batch) => batch.status === 'completed_mock'));
  assert.equal(status.autoresearch_cycle_policy.uses_agent_batches, true);
});

test('AutoResearch prepare and run inherit native agent batch cycles', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'autoresearch-agent-batches' });
  const prepared = await runSksInRoot(root, ['autoresearch', 'prepare', 'agent batch experiment loop', '--json']);
  assert.equal(prepared.schema, 'sks.autoresearch-prepare.v1');
  assert.match(prepared.methodology, /autoresearch-batch/);
  assert.equal(prepared.autoresearch_cycle_policy.uses_agent_batches, true);
  assert.ok(prepared.agent_batches.every((batch) => batch.mode === 'native_agent_batch'));

  const run = await runSksInRoot(root, ['autoresearch', 'run', prepared.mission_id, '--mock', '--json']);
  assert.equal(run.schema, 'sks.autoresearch-run.v1');
  assert.equal(run.autoresearch_cycle_policy.uses_agent_batches, true);
  assert.ok(run.agent_batches.some((batch) => batch.agents.includes('research_verifier')));
});

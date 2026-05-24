import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('QA Loop route runs in a hermetic temp project root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  assert.equal(prepared.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(prepared.native_agent_plan.verifier_personas_read_only_by_default, true);
  assert.ok(prepared.native_agent_plan.personas.every((persona) => persona.read_only === true));
  await fs.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'agents', 'agent-events.jsonl'));
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  const status = await runSksInRoot(root, ['qa-loop', 'status', prepared.mission_id, '--json']);
  assert.equal(status.native_agent_plan.central_ledger, 'agents/agent-events.jsonl');
  assert.ok(status.agent_sessions.qa_verifier_ui);
});

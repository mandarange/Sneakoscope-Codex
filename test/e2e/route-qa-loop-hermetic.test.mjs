import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { assertCompletionProofInRoot, createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('QA Loop route runs in a hermetic temp project root', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture API QA', '--json']);
  assert.equal(prepared.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(prepared.native_agent_plan.verifier_personas_read_only_by_default, true);
  assert.ok(prepared.native_agent_plan.personas.every((persona) => persona.read_only === true));
  await fs.access(path.join(root, '.sneakoscope', 'missions', prepared.mission_id, 'agents', 'agent-events.jsonl'));
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  await assertCompletionProofInRoot(root, json.mission_id, '$QA-LOOP');
  const status = await runSksInRoot(root, ['qa-loop', 'status', prepared.mission_id, '--json']);
  assert.equal(status.native_agent_plan.central_ledger, 'agents/agent-events.jsonl');
  const sessions = Object.values(status.agent_sessions || {});
  assert.ok(sessions.length >= 3);
  assert.ok(sessions.every((session) => session.status === 'closed'));
});

test('QA Loop mock does not pass live web UI evidence gate', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'qa-loop-ui-mock' });
  const prepared = await runSksInRoot(root, ['qa-loop', 'prepare', 'fixture UI QA', '--json']);
  const json = await runSksInRoot(root, ['qa-loop', 'run', prepared.mission_id, '--mock', '--json']);
  assert.equal(json.ok, false);
  assert.equal(json.status, 'verified_partial_mock_no_live_web_evidence');
  assert.equal(json.mock_only, true);
  assert.equal(json.live_web_evidence, false);
  assert.equal(json.gate.gate.passed, false);
  assert.equal(json.gate.gate.chrome_extension_preflight_passed, false);
  assert.equal(json.gate.gate.ui_chrome_extension_evidence, false);
  assert.equal(json.gate.gate.ui_evidence_source, 'mock_codex_chrome_extension_fixture_not_live');
});

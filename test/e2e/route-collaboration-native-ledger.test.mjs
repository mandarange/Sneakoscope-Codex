import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHermeticProjectRoot, runSksInRoot } from './route-real-command-helper.mjs';

test('DFix fixture writes native agent leases and central ledger', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'dfix-native-ledger' });
  const json = await runSksInRoot(root, ['dfix', 'fixture', '--json']);
  const missionDir = path.join(root, '.sneakoscope', 'missions', json.mission_id);
  const plan = JSON.parse(await fs.readFile(path.join(missionDir, 'dfix-agent-plan.json'), 'utf8'));

  assert.equal(plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(plan.implementer_gets_exclusive_file_leases, true);
  assert.equal(plan.verifier_gets_test_leases, true);
  assert.equal(plan.safety_agent_reviews_risky_changes, true);
  assert.ok(plan.leases.some((lease) => lease.owner_agent_id === 'dfix_implementer' && lease.exclusive === true));
  assert.ok(plan.leases.some((lease) => lease.owner_agent_id === 'dfix_verifier' && lease.mode === 'test_lease'));
  assert.ok(plan.personas.some((persona) => persona.id === 'dfix_safety' && persona.read_only === true && persona.reviews_risky_changes === true));
  await fs.access(path.join(missionDir, 'agents', 'agent-events.jsonl'));
});

test('Review mode exposes native read-only safety personas', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'review-native-plan' });
  const status = await runSksInRoot(root, ['auto-review', 'status', '--json']);
  assert.equal(status.native_agent_plan.backend, 'native_multi_session_agent_kernel');
  assert.equal(status.native_agent_plan.safety_personas_read_only_by_default, true);
  assert.ok(status.native_agent_plan.personas.some((persona) => persona.id === 'review_safety' && persona.read_only === true));
});

test('route collaboration fixtures write central ledger, leases, session close, and proof graph', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'route-collab-ledger' });
  const review = await runSksInRoot(root, ['auto-review', 'fixture', '--json']);
  const ppt = await runSksInRoot(root, ['ppt', 'fixture', '--json']);
  const ux = await runSksInRoot(root, ['ux-review', 'fixture', '--json']);
  const db = await runSksInRoot(root, ['db', 'check', '--sql', 'select 1', '--json']);

  await assertNativeRouteArtifacts(root, review.mission_id, 'Review');
  await assertNativeRouteArtifacts(root, ppt.mission_id, 'PPT-Collab');
  await assertNativeRouteArtifacts(root, ux.mission_id, 'UX-Collab');
  await assertNativeRouteArtifacts(root, db.completion_proof.mission_id, 'DB-Review');
});

test('Release-Review route collaboration uses native agent proof and route personas', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'release-route-collab', setup: false });
  const { createMission } = await import('../../dist/core/mission.js');
  const { writeRouteCollaborationArtifacts } = await import('../../dist/core/agents/route-collaboration-ledger.js');
  const mission = await createMission(root, { mode: 'release', prompt: 'release route collaboration' });
  const native = await writeRouteCollaborationArtifacts(root, {
    missionId: mission.id,
    route: '$Release-Review',
    routeKey: 'Release-Review',
    prompt: 'Release gate audit with native agents',
    mode: 'RELEASE'
  });
  assert.equal(native.ok, true);
  await assertNativeRouteArtifacts(root, mission.id, 'Release-Review');
});

async function assertNativeRouteArtifacts(root, missionId, routeKey) {
  const missionDir = path.join(root, '.sneakoscope', 'missions', missionId);
  const agentRoot = path.join(missionDir, 'agents');
  const planName = `${routeKey.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-native-agent-plan.json`;
  const plan = JSON.parse(await fs.readFile(path.join(missionDir, planName), 'utf8'));
  const proof = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-proof-evidence.json'), 'utf8'));
  const cleanup = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-cleanup.json'), 'utf8'));
  const effort = JSON.parse(await fs.readFile(path.join(agentRoot, 'agent-effort-policy.json'), 'utf8'));

  assert.equal(plan.route_key, routeKey);
  assert.equal(plan.replaces_legacy_multiagent_runtime, true);
  assert.equal(plan.validation.central_ledger_written, true);
  assert.equal(plan.validation.task_board_written, true);
  assert.equal(plan.validation.non_overlap_leases_assigned, true);
  assert.equal(plan.validation.session_close_validated, true);
  assert.equal(plan.validation.proof_graph_validated, true);
  assert.equal(plan.validation.recursive_command_block_policy, true);
  assert.equal(plan.validation.real_mode_codex_sdk_backend, true);
  assert.ok(plan.route_specific_personas.length >= 3);
  assert.equal(proof.ok, true);
  assert.equal(proof.all_sessions_closed, true);
  assert.equal(cleanup.all_sessions_closed, true);
  assert.equal(effort.dynamic, true);

  await fs.access(path.join(agentRoot, 'agent-events.jsonl'));
  await fs.access(path.join(agentRoot, 'agent-task-board.json'));
  await fs.access(path.join(agentRoot, 'agent-leases.json'));
  await fs.access(path.join(agentRoot, 'agent-no-overlap-proof.json'));
}

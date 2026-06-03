#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createMission } from '../core/mission.js';
import { writeRouteCollaborationArtifacts } from '../core/agents/route-collaboration-ledger.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-release-native-agent-'));
await fs.writeFile(path.join(root, 'package.json'), `${JSON.stringify({ name: 'sks-release-native-agent-fixture', private: true, version: '0.0.0' }, null, 2)}\n`);
await fs.writeFile(path.join(root, 'README.md'), '# Release Native Agent Fixture\n');
const { id } = await createMission(root, { mode: 'release', prompt: 'Release native agent fixture' });
const native = await writeRouteCollaborationArtifacts(root, {
  missionId: id,
  route: '$Release-Review',
  routeKey: 'Release-Review',
  prompt: 'Release review route native agent plan for gate audit, package verification, and publish safety.',
  mode: 'RELEASE'
});
const missionDir = path.join(root, '.sneakoscope', 'missions', id);
const proof = JSON.parse(await fs.readFile(path.join(missionDir, 'agents', 'agent-proof-evidence.json'), 'utf8'));
const plan = JSON.parse(await fs.readFile(path.join(missionDir, 'release-review-native-agent-plan.json'), 'utf8'));

assert.equal(native.ok, true);
assert.equal(plan.route_key, 'Release-Review');
assert.equal(plan.replaces_legacy_multiagent_runtime, true);
assert.equal(plan.validation.central_ledger_written, true);
assert.equal(plan.validation.task_board_written, true);
assert.equal(plan.validation.non_overlap_leases_assigned, true);
assert.equal(plan.validation.session_close_validated, true);
assert.equal(plan.validation.proof_graph_validated, true);
assert.equal(plan.validation.release_gate_updated, true);
assert.equal(plan.validation.real_mode_codex_sdk_backend, true);
assert.equal(proof.ok, true);

console.log(JSON.stringify({
  schema: 'sks.release-native-agent-fixture-check.v1',
  ok: true,
  mission_id: id,
  proof: path.join('.sneakoscope', 'missions', id, 'agents', 'agent-proof-evidence.json'),
  plan: path.join('.sneakoscope', 'missions', id, 'release-review-native-agent-plan.json')
}, null, 2));

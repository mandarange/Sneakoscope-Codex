import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcileRetiredManagedResidue } from '../retired-managed-residue.js';
import { findFile } from './retired-managed-residue-test-helpers.js';

test('doctor current-surface reconciliation removes managed residue and quarantines user collisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-retired');
    const agentMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-agent');
    const shadowMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-shadow');
    const kageMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-kage');
    const currentMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-naruto');
    const collisionMissionRoot = path.join(root, '.sneakoscope', 'missions', 'M-user-collision');
    const retiredRoot = path.join(missionRoot, 'mad-db');
    const managedFile = path.join(retiredRoot, 'capability.json');
    const userFile = path.join(retiredRoot, 'notes.txt');
    const rootManagedFile = path.join(missionRoot, 'mad-db-result.json');
    const stateFile = path.join(root, '.sneakoscope', 'state', 'active-route.json');
    const agentStateFile = path.join(root, '.sneakoscope', 'state', 'sessions', 'agent.json');
    const workerRuntimeStateFile = path.join(root, '.sneakoscope', 'state', 'sessions', 'worker-runtime.json');
    const manifestFile = path.join(root, '.sneakoscope', 'agent-bridge', 'manifest.json');
    const gitPolicyFile = path.join(root, '.sneakoscope', 'git-policy.json');
    const missionIndexFile = path.join(root, '.sneakoscope', 'missions', 'index.json');
    const legacySwarmFile = path.join(agentMissionRoot, 'agents', 'native-cli-worker-runtime.json');
    const legacyProofFile = path.join(agentMissionRoot, 'agents', 'native-cli-worker-runtime-proof.json');
    const legacyWorkerDir = path.join(agentMissionRoot, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker');
    const currentSwarmFile = path.join(currentMissionRoot, 'agents', 'native-cli-worker-runtime.json');
    const retiredMadSwarmFile = path.join(currentMissionRoot, 'mad-sks-native-swarm.json');
    const retiredMadSwarmStdout = path.join(currentMissionRoot, 'mad-sks-native-swarm.stdout.log');
    const retiredReportFile = path.join(root, '.sneakoscope', 'reports', 'native-cli-worker-runtime.json');
    const collisionFile = path.join(collisionMissionRoot, 'customer-collision.txt');

    await fs.mkdir(retiredRoot, { recursive: true });
    await fs.mkdir(legacyWorkerDir, { recursive: true });
    await fs.mkdir(path.dirname(currentSwarmFile), { recursive: true });
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.mkdir(path.dirname(agentStateFile), { recursive: true });
    await fs.mkdir(path.dirname(manifestFile), { recursive: true });
    await fs.mkdir(path.dirname(retiredReportFile), { recursive: true });
    await fs.mkdir(collisionMissionRoot, { recursive: true });
    const managedMission = (id: string, mode: string) => ({
      id,
      mode,
      prompt: 'generated mission fixture',
      created_at: '2026-01-01T00:00:00.000Z',
      phase: 'PREPARE',
      questions_allowed: true,
      implementation_allowed: false
    });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), `${JSON.stringify(managedMission('M-retired', 'mad-db'))}\n`);
    await fs.writeFile(path.join(agentMissionRoot, 'mission.json'), `${JSON.stringify(managedMission('M-agent', 'agent'))}\n`);
    await fs.mkdir(shadowMissionRoot, { recursive: true });
    await fs.mkdir(kageMissionRoot, { recursive: true });
    await fs.writeFile(path.join(shadowMissionRoot, 'mission.json'), `${JSON.stringify(managedMission('M-shadow', '$ShadowClone'))}\n`);
    await fs.writeFile(path.join(kageMissionRoot, 'mission.json'), `${JSON.stringify(managedMission('M-kage', '$Kagebunshin'))}\n`);
    for (const [dir, id, mode] of [
      [missionRoot, 'M-retired', 'mad-db'],
      [agentMissionRoot, 'M-agent', 'agent'],
      [shadowMissionRoot, 'M-shadow', '$ShadowClone'],
      [kageMissionRoot, 'M-kage', '$Kagebunshin']
    ] as const) {
      await fs.writeFile(path.join(dir, 'events.jsonl'), `${JSON.stringify({ type: 'mission.created', mission: id, mode })}\n`);
    }
    await fs.writeFile(path.join(currentMissionRoot, 'mission.json'), `${JSON.stringify({ id: 'M-naruto', mode: 'internal-worker-runtime' })}\n`);
    await fs.writeFile(path.join(collisionMissionRoot, 'mission.json'), `${JSON.stringify({ id: 'customer-owned', mode: 'team', note: 'not an SKS mission record' })}\n`);
    await fs.writeFile(collisionFile, 'preserve-whole-user-collision\n');
    await fs.writeFile(managedFile, `${JSON.stringify({ schema: 'sks.mad-db-capability.v1' })}\n`);
    await fs.writeFile(rootManagedFile, `${JSON.stringify({ schema: 'sks.mad-db-cycle-result.v1' })}\n`);
    await fs.writeFile(userFile, 'preserve-user-authored-collision\n');
    await fs.writeFile(legacySwarmFile, `${JSON.stringify({ schema: 'sks.native-cli-worker-runtime.v2' })}\n`);
    await fs.writeFile(legacyProofFile, `${JSON.stringify({ schema: 'sks.native-cli-worker-runtime-proof.v1' })}\n`);
    await fs.writeFile(path.join(legacyWorkerDir, 'worker-session-proof.json'), `${JSON.stringify({ schema: 'sks.native-cli-worker-session-proof.v1' })}\n`);
    await fs.writeFile(currentSwarmFile, `${JSON.stringify({ schema: 'sks.native-cli-worker-runtime.v2', route: '$Naruto' })}\n`);
    await fs.writeFile(retiredMadSwarmFile, `${JSON.stringify({ schema: 'sks.mad-sks-native-swarm.v1' })}\n`);
    await fs.writeFile(retiredMadSwarmStdout, 'managed retired runtime log\n');
    await fs.writeFile(retiredReportFile, `${JSON.stringify({ schema: 'sks.native-cli-worker-runtime-check.v2' })}\n`);
    await fs.writeFile(missionIndexFile, `${JSON.stringify({
      schema: 'sks.mission-index.v1',
      mission_count: 6,
      latest_mission_id: 'M-naruto',
      missions: [
        { id: 'M-naruto', mode: 'internal-worker-runtime', created_ms: 3 },
        { id: 'M-shadow', mode: '$ShadowClone', created_ms: 2.5 },
        { id: 'M-kage', mode: '$Kagebunshin', created_ms: 2.25 },
        { id: 'M-agent', mode: 'agent', created_ms: 2 },
        { id: 'M-retired', mode: 'mad-db', created_ms: 1 },
        { id: 'M-user-collision', mode: 'team', created_ms: 0 }
      ]
    }, null, 2)}\n`);
    await fs.writeFile(stateFile, `${JSON.stringify({
      schema: 'sks.active-route.v1',
      route: '$MAD-DB',
      mad_db_capability_path: 'old-capability.json',
      shadow_clone_runtime: 'obsolete',
      kage_bunshin_state: 'obsolete',
      keep: {
        value: 1,
        nested_customer_metadata: { mode: 'team', note: 'not route state' }
      }
    }, null, 2)}\n`);
    await fs.writeFile(agentStateFile, `${JSON.stringify({
      schema: 'sks.session-state.v1',
      mission_id: 'M-agent',
      mode: 'AGENT',
      phase: 'AGENT_NATIVE_KERNEL_DONE',
      route_command: 'sks agent run',
      native_agent_backend: 'codex-sdk',
      keep: 'session-setting'
    }, null, 2)}\n`);
    await fs.writeFile(workerRuntimeStateFile, `${JSON.stringify({
      mission_id: 'M-naruto',
      mode: 'WORKER_RUNTIME',
      phase: 'WORKER_RUNTIME_RUNNING',
      route_command: 'internal-worker-runtime',
      native_agent_backend: 'codex-sdk',
      keep: 'current-runtime-setting'
    }, null, 2)}\n`);
    await fs.writeFile(manifestFile, `${JSON.stringify({
      schema: 'sks.agent-manifest.v1',
      generated_at: '2026-01-01T00:00:00.000Z',
      tools: [{
        name: 'team',
        description: 'old generated tool',
        example_invocation: 'sks team --json'
      }]
    }, null, 2)}\n`);
    await fs.writeFile(gitPolicyFile, '{"schema":"sks.git-policy.v1","version":"6.2.0","mode":"team"}\n');

    const observed = await reconcileRetiredManagedResidue({ root, fix: false });
    assert.equal(observed.ok, false);
    assert.ok(observed.detected_managed_artifact_count >= 4);
    assert.ok(observed.remaining_managed_artifact_count >= 4);
    assert.equal(observed.agent_bridge_manifest, 'would_reconcile');

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.ok(fixed.removed_managed_artifact_count >= 4);
    assert.equal(fixed.preserved_user_file_count, 2);
    assert.equal(fixed.remaining_managed_artifact_count, 0);
    assert.equal(fixed.agent_bridge_manifest, 'reconciled');
    assert.doesNotMatch(JSON.stringify(fixed), /team|mad-db/i);

    await assert.rejects(fs.access(managedFile));
    await assert.rejects(fs.access(rootManagedFile));
    await assert.rejects(fs.access(userFile));
    await assert.rejects(fs.access(legacySwarmFile));
    await assert.rejects(fs.access(legacyProofFile));
    await assert.rejects(fs.access(path.join(agentMissionRoot, 'agents', 'sessions')));
    await assert.rejects(fs.access(retiredMadSwarmFile));
    await assert.rejects(fs.access(retiredMadSwarmStdout));
    await assert.rejects(fs.access(retiredReportFile));
    await assert.rejects(fs.access(currentSwarmFile));
    const quarantined = await findFile(root, 'notes.txt');
    assert.ok(quarantined?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.equal(await fs.readFile(quarantined!, 'utf8'), 'preserve-user-authored-collision\n');
    const quarantinedCollision = await findFile(root, 'customer-collision.txt');
    assert.ok(quarantinedCollision?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.equal(await fs.readFile(quarantinedCollision!, 'utf8'), 'preserve-whole-user-collision\n');

    const state = JSON.parse(await fs.readFile(stateFile, 'utf8'));
    assert.equal(state.route, undefined);
    assert.equal(state.mad_db_capability_path, undefined);
    assert.equal(state.shadow_clone_runtime, undefined);
    assert.equal(state.kage_bunshin_state, undefined);
    assert.deepEqual(state.keep, {
      value: 1,
      nested_customer_metadata: { mode: 'team', note: 'not route state' }
    });
    assert.equal(state.implementation_allowed, false);
    assert.equal(state.questions_allowed, false);
    assert.equal(state.route_closed, true);

    const agentState = JSON.parse(await fs.readFile(agentStateFile, 'utf8'));
    assert.equal(agentState.mission_id, undefined);
    assert.equal(agentState.mode, undefined);
    assert.equal(agentState.route_command, undefined);
    assert.equal(agentState.native_agent_backend, undefined);
    assert.equal(agentState.phase, 'CURRENT_SURFACE_RECONCILED');
    assert.equal(agentState.route_closed, true);
    assert.equal(agentState.keep, 'session-setting');

    const workerRuntimeState = JSON.parse(await fs.readFile(workerRuntimeStateFile, 'utf8'));
    assert.equal(workerRuntimeState.mission_id, 'M-naruto');
    assert.equal(workerRuntimeState.mode, 'WORKER_RUNTIME');
    assert.equal(workerRuntimeState.phase, 'WORKER_RUNTIME_RUNNING');
    assert.equal(workerRuntimeState.route_command, 'internal-worker-runtime');
    assert.equal(workerRuntimeState.native_agent_backend, 'codex-sdk');
    assert.equal(workerRuntimeState.keep, 'current-runtime-setting');

    const missionIndex = JSON.parse(await fs.readFile(missionIndexFile, 'utf8'));
    assert.equal(missionIndex.mission_count, 1);
    assert.equal(missionIndex.latest_mission_id, 'M-naruto');
    assert.deepEqual(missionIndex.missions.map((row: any) => row.id), ['M-naruto']);
    assert.ok(missionIndex.missions.every((row: any) => !Object.hasOwn(row, 'mode')));

    const manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
    const names = manifest.tools.map((tool: any) => tool.name);
    assert.equal(names.includes('team'), false);
    assert.equal(names.includes('mad-db'), false);
    assert.equal(JSON.parse(await fs.readFile(gitPolicyFile, 'utf8')).mode, 'work');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor maps only explicit legacy git-policy modes and quarantines unknown modes byte for byte', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-git-policy-'));
  try {
    const gitPolicyFile = path.join(root, '.sneakoscope', 'git-policy.json');
    await fs.mkdir(path.dirname(gitPolicyFile), { recursive: true });
    await fs.writeFile(gitPolicyFile, '{"schema":"sks.git-policy.v1","version":"6.2.0","mode":"strict-team"}\n');

    const strictFixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(strictFixed.ok, true);
    assert.equal(JSON.parse(await fs.readFile(gitPolicyFile, 'utf8')).mode, 'strict-work');

    const unknownBytes = Buffer.from('{ "schema": "sks.git-policy.v1", "version": "future", "mode": "future-collaboration", "keep": true }\n');
    await fs.writeFile(gitPolicyFile, unknownBytes);
    const unknownFixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(unknownFixed.ok, true);
    assert.equal(unknownFixed.preserved_user_file_count, 1);
    await assert.rejects(fs.access(gitPolicyFile));
    const quarantined = await findFile(root, 'git-policy.json');
    assert.ok(quarantined?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.deepEqual(await fs.readFile(quarantined!), unknownBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor quarantines user files from a mixed retired session tree before removing managed proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-mixed-session-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current');
    const workerRoot = path.join(missionRoot, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker');
    const proofFile = path.join(workerRoot, 'worker-session-proof.json');
    const userFile = path.join(workerRoot, 'notes.txt');
    await fs.mkdir(workerRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), `${JSON.stringify({
      id: 'M-current',
      mode: 'internal-worker-runtime'
    })}\n`);
    await fs.writeFile(proofFile, `${JSON.stringify({ schema: 'sks.native-cli-worker-session-proof.v1' })}\n`);
    await fs.writeFile(userFile, 'customer session notes\n');

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.removed_managed_artifact_count, 1);
    assert.equal(fixed.preserved_user_file_count, 1);
    assert.equal(fixed.remaining_managed_artifact_count, 0);
    await assert.rejects(fs.access(proofFile));
    await assert.rejects(fs.access(userFile));
    const quarantined = await findFile(root, 'notes.txt');
    assert.ok(quarantined?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.equal(await fs.readFile(quarantined!, 'utf8'), 'customer session notes\n');
    assert.equal(JSON.parse(await fs.readFile(path.join(missionRoot, 'mission.json'), 'utf8')).id, 'M-current');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor never follows retired managed-root symlinks outside the project', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-symlink-root-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-outside-'));
  try {
    const teamTarget = path.join(outside, 'team-target');
    const stateTarget = path.join(outside, 'state-target');
    const bridgeTarget = path.join(outside, 'bridge-target');
    const teamFile = path.join(teamTarget, 'runtime.json');
    const stateFile = path.join(stateTarget, 'current.json');
    const bridgeFile = path.join(bridgeTarget, 'manifest.json');
    const teamBytes = Buffer.from('{"schema":"sks.team-runtime.v1","note":"outside"}\n');
    const stateBytes = Buffer.from('{"schema":"sks.active-route.v1","route":"team","note":"outside"}\n');
    const bridgeBytes = Buffer.from('{"schema":"sks.agent-manifest.v1","tools":[{"name":"team"}]}\n');
    await fs.mkdir(teamTarget, { recursive: true });
    await fs.mkdir(stateTarget, { recursive: true });
    await fs.mkdir(bridgeTarget, { recursive: true });
    await fs.writeFile(teamFile, teamBytes);
    await fs.writeFile(stateFile, stateBytes);
    await fs.writeFile(bridgeFile, bridgeBytes);
    await fs.mkdir(path.join(root, '.sneakoscope'), { recursive: true });
    await fs.symlink(teamTarget, path.join(root, '.sneakoscope', 'team'));
    await fs.symlink(stateTarget, path.join(root, '.sneakoscope', 'state'));
    await fs.symlink(bridgeTarget, path.join(root, '.sneakoscope', 'agent-bridge'));

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.equal(fixed.agent_bridge_manifest, 'user_collision_quarantined');
    assert.deepEqual(await fs.readFile(teamFile), teamBytes);
    assert.deepEqual(await fs.readFile(stateFile), stateBytes);
    assert.deepEqual(await fs.readFile(bridgeFile), bridgeBytes);
    await assert.rejects(fs.lstat(path.join(root, '.sneakoscope', 'team')));
    await assert.rejects(fs.lstat(path.join(root, '.sneakoscope', 'state')));
    assert.equal((await fs.lstat(path.join(root, '.sneakoscope', 'agent-bridge'))).isDirectory(), true);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('doctor quarantines user mission and state JSON collisions byte for byte', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-user-json-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-retired');
    const notesFile = path.join(missionRoot, 'notes.json');
    const stateFile = path.join(root, '.sneakoscope', 'state', 'sessions', 'customer.json');
    const notesBytes = Buffer.from('{ "mission_id": "M-retired", "note": "preserve me" }\n');
    const stateBytes = Buffer.from('{ "mission_id": "M-customer", "mode": "team", "note": "preserve me" }\n');
    const missionBytes = Buffer.from(`${JSON.stringify({
      id: 'M-retired',
      mode: 'team',
      prompt: 'generated mission fixture',
      created_at: '2026-01-01T00:00:00.000Z',
      phase: 'PREPARE',
      questions_allowed: true,
      implementation_allowed: false
    })}\n`);
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), missionBytes);
    await fs.writeFile(notesFile, notesBytes);
    await fs.writeFile(stateFile, stateBytes);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    await assert.rejects(fs.access(notesFile));
    await assert.rejects(fs.access(stateFile));
    const quarantinedNotes = await findFile(root, 'notes.json');
    const quarantinedState = await findFile(root, 'customer.json');
    const quarantinedMission = await findFile(root, 'mission.json');
    assert.ok(quarantinedNotes?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.ok(quarantinedState?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.ok(quarantinedMission?.includes(path.join('.sneakoscope', 'quarantine', 'retired-public-surface')));
    assert.deepEqual(await fs.readFile(quarantinedNotes!), notesBytes);
    assert.deepEqual(await fs.readFile(quarantinedState!), stateBytes);
    assert.deepEqual(await fs.readFile(quarantinedMission!), missionBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor does not treat MadDB2 as the retired MadDB route token', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-maddb2-'));
  try {
    const stateFile = path.join(root, '.sneakoscope', 'state', 'current.json');
    const bytes = Buffer.from('{"schema":"sks.active-route.v1","route":"MadDB2","note":"preserve"}\n');
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, bytes);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    assert.deepEqual(await fs.readFile(stateFile), bytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor removes the exact managed Team alias runtime artifact', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-team-alias-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current');
    const aliasFile = path.join(missionRoot, 'team-alias-to-naruto.json');
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), '{"id":"M-current","mode":"internal-worker-runtime"}\n');
    await fs.writeFile(aliasFile, '{"schema":"sks.team-alias-to-naruto.v1"}\n');

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    await assert.rejects(fs.access(aliasFile));
    assert.equal(JSON.parse(await fs.readFile(path.join(missionRoot, 'mission.json'), 'utf8')).id, 'M-current');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

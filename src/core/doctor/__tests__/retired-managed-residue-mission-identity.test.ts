import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { reconcileRetiredManagedResidue } from '../retired-managed-residue.js';
import { isRetiredMissionIdentity, isRetiredPublicValue } from '../retired-managed-residue-private.js';
import { findFile } from './retired-managed-residue-test-helpers.js';

const retiredTerminalCommand = ['tm', 'ux'].join('');

test('retired public value matching uses exact command and option boundaries', () => {
  for (const value of [
    'team',
    '$Team --json',
    'sks team --json',
    'sks mad-db run',
    `sks ${retiredTerminalCommand} status`,
    'sks xai ask',
    'sks swarm run',
    'sks agent run',
    'sks --agent codex'
  ]) assert.equal(isRetiredPublicValue(value), true, value);

  for (const value of [
    'sks agent-bridge setup --json',
    'sks --agent-model gpt-5.6',
    'AGENT_BRIDGE_READY',
    'sks teamcity status',
    'sks mad-db2 run',
    'internal-worker-runtime'
  ]) assert.equal(isRetiredPublicValue(value), false, value);
});

test('retired mission identity matching covers exact historical route metadata only', () => {
  for (const value of [
    { mode: 'team' },
    { mode: 'internal-worker-runtime', route: '$Agent' },
    { mode: 'internal-worker-runtime', route_command: 'sks agent run' },
    { mode: 'internal-worker-runtime', command: 'sks team --json' },
    { mode: 'internal-worker-runtime', route_blackbox_kind: 'actual_agent_command' },
    { mode: 'internal-worker-runtime', route_blackbox_kind: 'actual_team_command' }
  ]) assert.equal(isRetiredMissionIdentity(value), true, JSON.stringify(value));

  for (const value of [
    { mode: 'internal-worker-runtime' },
    { mode: 'internal-worker-runtime', route: 'MadDB2' },
    { mode: 'internal-worker-runtime', route_command: 'sks mad-db2 run' },
    { mode: 'internal-worker-runtime', command: 'sks agent-bridge setup --json' },
    { mode: 'internal-worker-runtime', route_blackbox_kind: 'actual_agent_bridge_command' },
    { mode: 'internal-worker-runtime', route_blackbox_kind: 'actual_research_command' },
    { mode: 'internal-worker-runtime', route_blackbox_kind: 'actual_qa_command' }
  ]) assert.equal(isRetiredMissionIdentity(value), false, JSON.stringify(value));
});

test('doctor removes missions identified by retired route metadata and refreshes the mission index', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-route-identity-'));
  try {
    const missionsRoot = path.join(root, '.sneakoscope', 'missions');
    const agentMission = managedMissionRecord('M-agent-route', {
      route: '$Agent',
      route_command: 'sks agent run',
      route_blackbox_kind: 'actual_agent_command'
    });
    const teamMission = managedMissionRecord('M-team-kind', {
      route_blackbox_kind: 'actual_team_command'
    });
    const ralphMission = managedMissionRecord('M-ralph-route', { route: '$Ralph' });
    const currentMissions = [
      {
        id: 'M-agent-bridge',
        mode: 'internal-worker-runtime',
        route: 'sks agent-bridge status',
        route_command: 'sks agent-bridge setup --json',
        route_blackbox_kind: 'actual_agent_bridge_command',
        created_at: '2026-01-03T00:00:00.000Z'
      },
      {
        id: 'M-maddb2',
        mode: 'internal-worker-runtime',
        route: 'MadDB2',
        route_command: 'sks mad-db2 run',
        created_at: '2026-01-04T00:00:00.000Z'
      }
    ];
    for (const mission of [agentMission, teamMission, ralphMission, ...currentMissions]) {
      const missionRoot = path.join(missionsRoot, mission.id);
      await fs.mkdir(missionRoot, { recursive: true });
      await fs.writeFile(path.join(missionRoot, 'mission.json'), `${JSON.stringify(mission)}\n`);
      if (mission === agentMission || mission === teamMission || mission === ralphMission) {
        const identity = mission as Record<string, unknown>;
        await fs.writeFile(path.join(missionRoot, 'events.jsonl'), `${JSON.stringify({
          type: 'mission.created',
          mission: mission.id,
          mode: mission.mode,
          route: identity.route,
          route_command: identity.route_command,
          route_blackbox_kind: identity.route_blackbox_kind
        })}\n`);
      }
    }
    await fs.writeFile(path.join(missionsRoot, 'index.json'), `${JSON.stringify({
      schema: 'sks.mission-index.v1',
      mission_count: 5,
      latest_mission_id: 'M-maddb2',
      missions: [agentMission, teamMission, ralphMission, ...currentMissions]
    }, null, 2)}\n`);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    await assert.rejects(fs.access(path.join(missionsRoot, agentMission.id)));
    await assert.rejects(fs.access(path.join(missionsRoot, teamMission.id)));
    await assert.rejects(fs.access(path.join(missionsRoot, ralphMission.id)));
    assert.equal(await findFile(path.join(root, '.sneakoscope', 'quarantine', 'retired-public-surface'), 'mission.json'), null);
    for (const mission of currentMissions) {
      assert.equal(JSON.parse(await fs.readFile(path.join(missionsRoot, mission.id, 'mission.json'), 'utf8')).id, mission.id);
    }
    const index = JSON.parse(await fs.readFile(path.join(missionsRoot, 'index.json'), 'utf8'));
    assert.equal(index.mission_count, 2);
    assert.deepEqual(index.missions.map((row: any) => row.id).sort(), ['M-agent-bridge', 'M-maddb2']);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor quarantines malformed retired route mission collisions byte for byte', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-route-collision-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-route-collision');
    const missionBytes = Buffer.from('{"id":"M-route-collision","mode":"internal-worker-runtime","route":"$Agent","customer":true}\n');
    const notesBytes = Buffer.from('customer-owned route mission notes\n');
    await fs.mkdir(missionRoot, { recursive: true });
    await fs.writeFile(path.join(missionRoot, 'mission.json'), missionBytes);
    await fs.writeFile(path.join(missionRoot, 'notes.txt'), notesBytes);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    await assert.rejects(fs.access(missionRoot));
    const quarantinedMission = await findFile(root, 'mission.json');
    const quarantinedNotes = await findFile(root, 'notes.txt');
    assert.deepEqual(await fs.readFile(quarantinedMission!), missionBytes);
    assert.deepEqual(await fs.readFile(quarantinedNotes!), notesBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('doctor never follows a symlinked retired route mission target', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-route-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-surface-route-target-'));
  try {
    const mission = managedMissionRecord('M-agent-link', { route: '$Agent' });
    const missionBytes = Buffer.from(`${JSON.stringify(mission)}\n`);
    const eventBytes = Buffer.from(`${JSON.stringify({ type: 'mission.created', mission: mission.id, route: '$Agent' })}\n`);
    await fs.writeFile(path.join(outside, 'mission.json'), missionBytes);
    await fs.writeFile(path.join(outside, 'events.jsonl'), eventBytes);
    const missionsRoot = path.join(root, '.sneakoscope', 'missions');
    await fs.mkdir(missionsRoot, { recursive: true });
    const missionLink = path.join(missionsRoot, mission.id);
    await fs.symlink(outside, missionLink);

    const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
    assert.equal(fixed.ok, true);
    await assert.rejects(fs.lstat(missionLink));
    assert.deepEqual(await fs.readFile(path.join(outside, 'mission.json')), missionBytes);
    assert.deepEqual(await fs.readFile(path.join(outside, 'events.jsonl')), eventBytes);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

test('doctor quarantines symlinked Goal artifacts without touching external targets', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-goal-symlink-'));
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-current-goal-target-'));
  try {
    const missionRoot = path.join(root, '.sneakoscope', 'missions', 'M-current-goal');
    await fs.mkdir(missionRoot, { recursive: true });
    for (const [name, bytes] of [
      ['goal-workflow.json', Buffer.from('{"pipeline_contract":{"ralph_removed":true}}\n')],
      ['goal-bridge.md', Buffer.from('- Ralph route is removed from the user-facing SKS surface.\n')]
    ] as const) {
      const target = path.join(outside, name);
      const link = path.join(missionRoot, name);
      await fs.writeFile(target, bytes);
      await fs.symlink(target, link);

      const fixed = await reconcileRetiredManagedResidue({ root, fix: true });
      assert.equal(fixed.ok, true);
      await assert.rejects(fs.lstat(link));
      assert.deepEqual(await fs.readFile(target), bytes);
      const quarantined = await findFile(root, name);
      assert.ok(quarantined);
      assert.equal(await fs.readlink(quarantined), target);
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(outside, { recursive: true, force: true });
  }
});

function managedMissionRecord(id: string, identity: Record<string, string>) {
  return {
    id,
    mode: 'internal-worker-runtime',
    prompt: 'generated mission fixture',
    created_at: '2026-01-01T00:00:00.000Z',
    phase: 'PREPARE',
    questions_allowed: true,
    implementation_allowed: false,
    ...identity
  };
}

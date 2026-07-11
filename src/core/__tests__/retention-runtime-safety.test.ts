import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { enforceRetention } from '../retention.js';
import { backdate, makeRoot, quietPolicy, writeJson } from './retention-test-helpers.js';

test('GC removes only terminal or stale orphan runtime homes and preserves active session evidence', async () => {
  const root = await makeRoot('sks-retention-runtime-home-');
  try {
    const missions = path.join(root, '.sneakoscope', 'missions');
    const staleMission = path.join(missions, 'M-stale');
    const activeMission = path.join(missions, 'M-active');
    await writeJson(path.join(staleMission, 'mission.json'), { id: 'M-stale', phase: 'RUNNING' });
    await writeJson(path.join(activeMission, 'mission.json'), { id: 'M-active', phase: 'RUNNING' });
    await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), { mission_id: 'M-active' });

    const closedGen = path.join(staleMission, 'agents', 'sessions', 'slot-001', 'gen-1');
    const orphanGen = path.join(staleMission, 'agents', 'sessions', 'slot-002', 'gen-1');
    const activeGen = path.join(activeMission, 'agents', 'sessions', 'slot-001', 'gen-1');
    const activeBlockedGen = path.join(activeMission, 'agents', 'sessions', 'slot-002', 'gen-1');
    for (const [gen, status] of [[closedGen, 'closed'], [orphanGen, 'running'], [activeGen, 'running'], [activeBlockedGen, 'blocked']] as const) {
      await writeJson(path.join(gen, 'agent-session-record.json'), {
        status,
        heartbeat_at: '2020-01-01T00:00:00.000Z',
        ...(status === 'closed' ? { closed_at: '2020-01-01T00:01:00.000Z' } : {})
      });
      await writeJson(path.join(gen, 'worker', 'worker-result.json'), { status: status === 'closed' ? 'blocked' : 'running' });
      const cache = path.join(gen, 'worker', 'codex-sdk-home', 'home', '.cache', 'uv', 'payload.bin');
      await fs.mkdir(path.dirname(cache), { recursive: true });
      await fs.writeFile(cache, 'runtime cache\n');
    }

    const result = await enforceRetention(root, {
      skipStorageReport: true,
      fullMissionSweep: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });
    for (const gen of [closedGen, orphanGen]) {
      assert.equal(await fs.access(path.join(gen, 'worker', 'codex-sdk-home')).then(() => true, () => false), false);
      assert.equal(await fs.access(path.join(gen, 'agent-session-record.json')).then(() => true, () => false), true);
      assert.equal(await fs.access(path.join(gen, 'worker', 'worker-result.json')).then(() => true, () => false), true);
    }
    assert.equal(await fs.access(path.join(activeGen, 'worker', 'codex-sdk-home')).then(() => true, () => false), true);
    assert.equal(await fs.access(path.join(activeBlockedGen, 'worker', 'codex-sdk-home')).then(() => true, () => false), true);
    assert.ok(result.actions.some((action: any) => action.action === 'remove_terminal_session_runtime_home'));
    assert.ok(result.actions.some((action: any) => action.action === 'remove_orphaned_session_runtime_home'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('after-route cleanup rejects traversal mission ids and cannot delete outside missions root', async () => {
  const root = await makeRoot('sks-retention-traversal-');
  try {
    const victim = path.join(root, 'victim', 'agents', 'sessions', 'slot-001', 'codex-sdk-home', 'keep.txt');
    await fs.mkdir(path.dirname(victim), { recursive: true });
    await fs.writeFile(victim, 'preserve\n');

    const result = await enforceRetention(root, {
      afterRoute: true,
      completedMissionId: '../../victim',
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.access(victim).then(() => true, () => false), true);
    assert.equal(result.actions.some((action: any) => String(action.path || '').includes(`${path.sep}victim${path.sep}`)), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('after-route cleanup rejects a canonical mission id whose directory is an external symlink', async () => {
  const root = await makeRoot('sks-retention-mission-symlink-');
  const victim = await makeRoot('sks-retention-mission-victim-');
  try {
    const worktree = path.join(victim, 'agents', 'worktrees', 'keep.txt');
    await fs.mkdir(path.dirname(worktree), { recursive: true });
    await fs.writeFile(worktree, 'preserve\n');
    const missions = path.join(root, '.sneakoscope', 'missions');
    await fs.mkdir(missions, { recursive: true });
    await fs.symlink(victim, path.join(missions, 'M-evil'));

    const result = await enforceRetention(root, {
      afterRoute: true,
      completedMissionId: 'M-evil',
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.readFile(worktree, 'utf8'), 'preserve\n');
    assert.equal(result.actions.some((action: any) => String(action.path || '').startsWith(victim)), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(victim, { recursive: true, force: true });
  }
});

test('GC refuses a symlinked project temp root and preserves external files', async () => {
  const root = await makeRoot('sks-retention-symlink-root-');
  const victim = await makeRoot('sks-retention-symlink-victim-');
  try {
    const sks = path.join(root, '.sneakoscope');
    await fs.mkdir(sks, { recursive: true });
    const precious = path.join(victim, 'precious.txt');
    await fs.writeFile(precious, 'preserve\n');
    await backdate(precious);
    await fs.symlink(victim, path.join(sks, 'tmp'));

    const result = await enforceRetention(root, {
      lightweight: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.readFile(precious, 'utf8'), 'preserve\n');
    assert.ok(result.actions.some((action: any) => action.action === 'skip_unsafe_retention_root'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
    await fs.rm(victim, { recursive: true, force: true });
  }
});

test('GC preserves terminal session diagnostics while removing only their runtime homes', async () => {
  const root = await makeRoot('sks-retention-terminal-mission-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-terminal');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-terminal', phase: 'RUNNING' });
    await writeJson(path.join(mission, 'agents', 'agent-session-cleanup.json'), {
      all_sessions_terminal: true,
      total_sessions: 2,
      terminal_session_count: 2
    });
    await writeJson(path.join(mission, 'agents', 'agent-proof-evidence.json'), { schema: 'fixture.proof.v1' });
    const session = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1');
    await writeJson(path.join(session, 'agent-session-record.json'), { status: 'blocked', closed_at: new Date().toISOString() });
    await writeJson(path.join(session, 'worker', 'worker-result.json'), { status: 'blocked' });
    const runtimeHome = path.join(session, 'worker', 'codex-sdk-home');
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'temporary runtime\n');

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: quietPolicy
    });

    assert.equal(await fs.access(path.join(mission, 'agents', 'sessions')).then(() => true, () => false), true);
    assert.equal(await fs.access(runtimeHome).then(() => true, () => false), false);
    assert.equal(await fs.access(path.join(session, 'worker', 'worker-result.json')).then(() => true, () => false), true);
    assert.equal(await fs.access(path.join(mission, 'agents', 'agent-session-cleanup.json')).then(() => true, () => false), true);
    assert.equal(await fs.access(path.join(mission, 'agents', 'agent-proof-evidence.json')).then(() => true, () => false), true);
    assert.ok(result.actions.some((action: any) => action.action === 'remove_terminal_session_runtime_home'));
    assert.equal(result.actions.some((action: any) => action.action === 'remove_terminal_mission_workdir'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('a route-closed current mission is inactive and its terminal worker homes are compacted', async () => {
  const root = await makeRoot('sks-retention-route-closed-current-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-route-closed');
    await writeJson(path.join(root, '.sneakoscope', 'state', 'current.json'), {
      mission_id: 'M-route-closed',
      route_closed: true,
      updated_at: new Date().toISOString()
    });
    await writeJson(path.join(root, '.sneakoscope', 'state', 'sessions', 'closed.json'), {
      mission_id: 'M-route-closed',
      route_closed: true,
      updated_at: new Date().toISOString()
    });
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), {
      sessions: { 'slot-001': { status: 'blocked', closed_at: new Date().toISOString() } }
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeJson(path.join(mission, 'agents', 'agent-session-cleanup.json'), {
      all_sessions_terminal: true,
      total_sessions: 1,
      terminal_session_count: 1
    });
    const runtimeHome = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home');
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'temporary cache\n');

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: quietPolicy
    });

    assert.equal(await fs.access(runtimeHome).then(() => true, () => false), false);
    assert.ok(result.actions.some((action: any) => action.action === 'remove_terminal_session_runtime_home'));
    assert.equal(result.actions.some((action: any) => action.action === 'remove_terminal_mission_workdir'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('GC does not trust stale terminal cleanup after a mission has been resumed', async () => {
  const root = await makeRoot('sks-retention-resumed-mission-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-resumed');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-resumed', phase: 'RUNNING' });
    await writeJson(path.join(mission, 'agents', 'agent-session-cleanup.json'), {
      all_sessions_terminal: true,
      total_sessions: 1,
      terminal_session_count: 1
    });
    await new Promise((resolve) => setTimeout(resolve, 10));
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), {
      sessions: { 'slot-001': { status: 'pending' } }
    });
    const runtime = path.join(mission, 'agents', 'sessions', 'slot-001', 'runtime.tmp');
    await fs.mkdir(path.dirname(runtime), { recursive: true });
    await fs.writeFile(runtime, 'active runtime\n');

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: quietPolicy
    });

    assert.equal(await fs.readFile(runtime, 'utf8'), 'active runtime\n');
    assert.equal(result.actions.some((action: any) => action.action === 'remove_terminal_mission_workdir'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('GC preserves resumed live sessions even when stale completion proof still says closed', async () => {
  const root = await makeRoot('sks-retention-resumed-closed-mission-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-resumed-closed');
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), {
      sessions: { 'slot-001': { status: 'running' } }
    });
    const runtime = path.join(mission, 'agents', 'sessions', 'slot-001', 'runtime.tmp');
    await fs.mkdir(path.dirname(runtime), { recursive: true });
    await fs.writeFile(runtime, 'resumed runtime\n');

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: quietPolicy
    });

    assert.equal(await fs.readFile(runtime, 'utf8'), 'resumed runtime\n');
    assert.equal(result.actions.some((action: any) => String(action.path || '').includes('M-resumed-closed') && String(action.action).includes('workdir')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('old-mission pruning and runtime-home cleanup both preserve a resumed live session', async () => {
  const root = await makeRoot('sks-retention-resumed-prune-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-resumed-prune');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-resumed-prune', created_at: '2020-01-01T00:00:00.000Z' });
    await writeJson(path.join(mission, 'completion-proof.json'), { status: 'verified', blockers: [] });
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), {
      sessions: { 'slot-001': { session_id: 'live-session', status: 'running' } }
    });
    const runtimeHome = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home');
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'live runtime\n');
    await backdate(mission);

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, prune_old_missions: true, max_missions: 0, max_mission_age_days: 0 }
    });

    assert.equal(await fs.readFile(path.join(runtimeHome, 'cache.bin'), 'utf8'), 'live runtime\n');
    assert.ok(result.actions.some((row: any) => row.action === 'retain_mission_live_sessions'));
    assert.ok(result.actions.some((row: any) => row.action === 'retain_live_session_runtime_homes'));
    assert.equal(result.actions.some((row: any) => row.mission === 'M-resumed-prune' && String(row.action).startsWith('remove_')), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('old null-timestamp pending rows without a live PID do not retain runtime homes forever', async () => {
  const root = await makeRoot('sks-retention-stale-pending-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-stale-pending');
    const sessionIndex = path.join(mission, 'agents', 'agent-sessions.json');
    const runtimeHome = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-stale-pending', created_at: '2020-01-01T00:00:00.000Z' });
    await writeJson(sessionIndex, {
      sessions: {
        'slot-001': { status: 'pending', opened_at: null, closed_at: null, heartbeat_at: null }
      }
    });
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'stale pending runtime\n');
    await backdate(sessionIndex);
    await backdate(runtimeHome);

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.access(runtimeHome).then(() => true, () => false), false);
    assert.ok(result.actions.some((row: any) => row.action === 'remove_orphaned_session_runtime_home' && row.mission === 'M-stale-pending'));
    assert.equal(result.actions.some((row: any) => row.action === 'retain_live_session_runtime_homes' && row.mission === 'M-stale-pending'), false);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('recent pending session-index activity remains protected', async () => {
  const root = await makeRoot('sks-retention-recent-pending-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-recent-pending');
    const runtimeHome = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1', 'worker', 'codex-sdk-home');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-recent-pending' });
    await writeJson(path.join(mission, 'agents', 'agent-sessions.json'), {
      sessions: {
        'slot-001': { status: 'pending', opened_at: null, closed_at: null, heartbeat_at: null }
      }
    });
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'recent pending runtime\n');
    await backdate(runtimeHome);

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.readFile(path.join(runtimeHome, 'cache.bin'), 'utf8'), 'recent pending runtime\n');
    assert.ok(result.actions.some((row: any) => row.action === 'retain_live_session_runtime_homes' && row.mission === 'M-recent-pending'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test('an old nonterminal row with an actually live foreign PID remains fail-safe protected', async () => {
  const root = await makeRoot('sks-retention-live-foreign-pid-');
  try {
    const mission = path.join(root, '.sneakoscope', 'missions', 'M-live-foreign-pid');
    const artifact = path.join(mission, 'agents', 'sessions', 'slot-001', 'gen-1');
    const runtimeHome = path.join(artifact, 'worker', 'codex-sdk-home');
    const sessionIndex = path.join(mission, 'agents', 'agent-sessions.json');
    const processReport = path.join(artifact, 'worker', 'worker-process-report.json');
    await writeJson(path.join(mission, 'mission.json'), { id: 'M-live-foreign-pid', created_at: '2020-01-01T00:00:00.000Z' });
    await writeJson(sessionIndex, {
      sessions: {
        'slot-001': {
          status: 'running',
          heartbeat_at: '2020-01-01T00:00:00.000Z',
          session_artifact_dir: 'sessions/slot-001/gen-1'
        }
      }
    });
    await writeJson(processReport, {
      pid: process.pid,
      exit_code: null,
      project_namespace: 'foreign-project'
    });
    await fs.mkdir(runtimeHome, { recursive: true });
    await fs.writeFile(path.join(runtimeHome, 'cache.bin'), 'live foreign pid runtime\n');
    await backdate(sessionIndex);
    await backdate(processReport);
    await backdate(runtimeHome);

    const result = await enforceRetention(root, {
      fullMissionSweep: true,
      skipStorageReport: true,
      policy: { ...quietPolicy, max_tmp_age_hours: 0 }
    });

    assert.equal(await fs.readFile(path.join(runtimeHome, 'cache.bin'), 'utf8'), 'live foreign pid runtime\n');
    assert.ok(result.actions.some((row: any) => row.action === 'retain_live_session_runtime_homes' && row.mission === 'M-live-foreign-pid'));
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

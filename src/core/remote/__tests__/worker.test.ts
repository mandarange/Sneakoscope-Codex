import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeJsonAtomic } from '../../fsx.js';
import { stateFileForSession } from '../../mission.js';
import { remoteRuntimePaths } from '../audit-idempotency.js';
import { RemoteOwnerProofStore } from '../owner-proof.js';
import { RemoteWorker } from '../worker.js';
import type { RemoteCommandEnvelopeV1, RemoteMachineV1, RemoteOwnerProofV1, WorkerRequestV1 } from '../types.js';

async function setup(): Promise<{
  root: string;
  machine: RemoteMachineV1;
  owners: RemoteOwnerProofStore;
  owner: RemoteOwnerProofV1;
}> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-remote-worker-'));
  await fsp.mkdir(path.join(root, '.sneakoscope', 'state', 'sessions'), { recursive: true });
  await writeJsonAtomic(stateFileForSession(root, 'session-1'), {
    _session_key: 'session-1',
    mission_id: 'M-fixture',
    route_command: '$Team',
    phase: 'IMPLEMENT',
    active_generation: 2,
    updated_at: new Date().toISOString()
  });
  const machine: RemoteMachineV1 = {
    id: 'mac', display_name: 'Mac', transport: 'ssh-stdio', ssh_alias: 'sks-mac', allowed_roots: [root], enabled: true
  };
  const owner: RemoteOwnerProofV1 = {
    schema: 'sks.remote-owner-proof.v1',
    session_id: 'session-1',
    project_id: 'project-1',
    project_root: root,
    pid: 999,
    process_start_time: 'Tue Jul 14 21:00:00 2026',
    expected_command: 'codex exec --session session-1',
    owner_nonce: 'owner-nonce-abcdefghijklmnopqrstuvwxyz',
    active_generation: 2,
    codex_thread_id: 'thread-1',
    active_turn_id: 'turn-1',
    registered_at: new Date().toISOString()
  };
  const owners = new RemoteOwnerProofStore(remoteRuntimePaths(root).owners);
  await owners.register(owner);
  return { root, machine, owners, owner };
}

function command(kind: RemoteCommandEnvelopeV1['kind'], overrides: Partial<RemoteCommandEnvelopeV1> = {}): RemoteCommandEnvelopeV1 {
  const now = Date.now();
  const risk = kind === 'read' ? 'R0' : kind === 'cancel' ? 'R2' : 'R1';
  return {
    schema: 'sks.remote-command.v1',
    command_id: `command-${kind}`,
    issued_at: new Date(now - 1_000).toISOString(),
    expires_at: new Date(now + 60_000).toISOString(),
    actor: 'telegram-owner',
    machine_id: 'mac',
    project_id: 'project-1',
    session_id: 'session-1',
    kind,
    risk,
    payload: {},
    idempotency_key: `idem-${kind}`,
    ...overrides
  };
}

function request(id: string, envelope: RemoteCommandEnvelopeV1): Extract<WorkerRequestV1, { type: 'command' }> {
  return { schema: 'sks.remote-worker.request.v1', id, type: 'command', envelope };
}

test('worker lists sessions and keeps terminal state distinct from completion proof', async () => {
  const fx = await setup();
  const worker = new RemoteWorker({ root: fx.root, machine: fx.machine, projectId: 'project-1' });
  const listed = await worker.handle({ schema: 'sks.remote-worker.request.v1', id: 'list', type: 'list_sessions' });
  assert.equal(listed.ok, true);
  assert.equal((listed.data as { sessions: Array<{ session_id: string }> }).sessions[0]?.session_id, 'session-1');
  const snapshot = await worker.handle({ schema: 'sks.remote-worker.request.v1', id: 'read', type: 'read_snapshot', session_id: 'session-1' });
  assert.equal((snapshot.data as { completion_verified: boolean }).completion_verified, false);
  assert.equal((snapshot.data as { session_state: string }).session_state, 'active');
});

test('typed input uses the exact turn precondition and duplicate idempotency does not steer twice', async () => {
  const fx = await setup();
  const calls: Record<string, unknown>[] = [];
  let closes = 0;
  const worker = new RemoteWorker({
    root: fx.root,
    machine: fx.machine,
    projectId: 'project-1',
    codexClientFactory: async () => ({
      initialize: async () => undefined,
      steerTurn: async (params) => { calls.push(params); return { ok: true }; },
      close: async () => { closes += 1; }
    })
  });
  const envelope = command('input', { payload: { text: 'continue with focused tests' } });
  const first = await worker.handle(request('input-1', envelope));
  const duplicate = await worker.handle(request('input-2', envelope));
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(closes, 1);
  assert.deepEqual(calls[0], {
    threadId: 'thread-1',
    expectedTurnId: 'turn-1',
    input: [{ type: 'text', text: 'continue with focused tests', text_elements: [] }]
  });
  const audit = await fsp.readFile(remoteRuntimePaths(fx.root).audit, 'utf8');
  assert.equal(audit.includes('continue with focused tests'), false);
});

test('cancel requires owner proof and exact approval, and duplicate delivery never kills twice', async () => {
  const fx = await setup();
  let kills = 0;
  const worker = new RemoteWorker({
    root: fx.root,
    machine: fx.machine,
    projectId: 'project-1',
    owners: fx.owners,
    inspectProcess: async () => ({
      pid: fx.owner.pid,
      process_start_time: fx.owner.process_start_time,
      command: fx.owner.expected_command,
      project_root: fx.root
    }),
    killProcess: async () => { kills += 1; }
  });
  const now = Date.now();
  const envelope = command('cancel', {
    payload: {
      owner_nonce: fx.owner.owner_nonce,
      expected_pid: fx.owner.pid,
      expected_process_start_time: fx.owner.process_start_time,
      expected_command: fx.owner.expected_command,
      expected_project_root: fx.root,
      expected_generation: 2,
      approval: {
        schema: 'sks.remote-r2-approval.v1',
        approval_id: 'approval-1',
        approved_by: 'telegram-owner',
        approved_at: new Date(now - 1_000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
        machine_id: 'mac',
        project_id: 'project-1',
        session_id: 'session-1',
        kind: 'cancel',
        command_id: 'command-cancel'
      }
    }
  });
  const first = await worker.handle(request('cancel-1', envelope));
  const duplicate = await worker.handle(request('cancel-2', envelope));
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, true);
  assert.equal(kills, 1);
  const watched = await worker.handle({ schema: 'sks.remote-worker.request.v1', id: 'watch', type: 'watch', after_seq: 0 });
  assert.equal(watched.ok, true);
  assert.equal((watched.data as { events: unknown[] }).events.length, 1);
});

test('worker rejects unknown machine/project envelopes before claiming idempotency', async () => {
  const fx = await setup();
  const worker = new RemoteWorker({ root: fx.root, machine: fx.machine, projectId: 'project-1' });
  const machineMismatch = await worker.handle(request('bad-machine', command('read', { machine_id: 'other' })));
  const projectMismatch = await worker.handle(request('bad-project', command('read', { project_id: 'other', idempotency_key: 'other-key' })));
  assert.equal(machineMismatch.error?.code, 'command_machine_mismatch');
  assert.equal(projectMismatch.error?.code, 'command_project_mismatch');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RemoteLocalWorkerClient } from '../local-worker-client.js';
import { validateRemoteMachineRegistry } from '../machine-registry.js';
import { RemoteCodexSessionBindingStore, remoteCodexSessionBindingsPath } from '../session-binding.js';
import type { RemoteMachineV1 } from '../types.js';

test('local machines validate without SSH aliases and bindings persist pending or exact Codex thread ids', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-remote-binding-'));
  const machine: RemoteMachineV1 = {
    id: 'local-mac',
    display_name: 'This Mac',
    transport: 'local',
    allowed_roots: [root],
    enabled: true
  };
  const validation = validateRemoteMachineRegistry({
    schema: 'sks.remote-machines.v1',
    machines: [machine]
  });
  assert.equal(validation.ok, true);
  assert.equal(validation.registry?.machines[0]?.transport, 'local');
  assert.equal(validation.registry?.machines[0]?.ssh_alias, undefined);

  const store = new RemoteCodexSessionBindingStore(remoteCodexSessionBindingsPath(root));
  const pending = await store.upsert({
    session_id: 'telegram-pending',
    machine_id: machine.id,
    project_id: 'project-1',
    project_root: root,
    codex_thread_id: null
  });
  assert.equal(pending.codex_thread_id, null);
  const saved = await store.upsert({
    session_id: 'telegram-session',
    machine_id: machine.id,
    project_id: 'project-1',
    project_root: root,
    codex_thread_id: '019f-thread'
  });
  assert.equal(saved.codex_thread_id, '019f-thread');
  assert.equal((await store.find('telegram-session'))?.project_root, root);
  const bindingMode = (await fsp.stat(remoteCodexSessionBindingsPath(root))).mode & 0o777;
  assert.equal(bindingMode, 0o600);

  const client = new RemoteLocalWorkerClient({
    machine,
    projectRoot: root,
    projectId: 'project-1'
  });
  const hello = await client.request({
    schema: 'sks.remote-worker.request.v1',
    id: 'hello',
    type: 'hello'
  });
  assert.equal(hello.ok, true);
  assert.equal((hello.data as { machine_id?: string }).machine_id, machine.id);
  await client.close();
});

import '../../__tests__/helpers/isolated-test-home.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { removeRetiredLocalDecisionRuntime } from '../update-migration-state/retired-local-decision.js';

async function fixture(t: test.TestContext): Promise<{ env: NodeJS.ProcessEnv; socketDir: string }> {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-retired-ld-'));
  const socketDir = path.join(root, 'sockets', `sks-ld-${process.getuid?.() ?? 0}`);
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  return {
    env: { HOME: path.join(root, 'home'), SKS_HOME: path.join(root, 'sks'), PATH: process.env.PATH || '' },
    socketDir
  };
}

test('update cleanup removes the managed local-decision runtime and keeps Jev config', async (t) => {
  const { env, socketDir } = await fixture(t);
  const runtime = path.join(env.SKS_HOME!, 'local-decision');
  const outside = path.join(env.SKS_HOME!, 'outside.txt');
  await fsp.mkdir(path.join(runtime, 'venv', 'bin'), { recursive: true });
  await fsp.writeFile(path.join(runtime, 'config.json'), JSON.stringify({ schemaVersion: 1, mode: 'advisory' }));
  await fsp.writeFile(outside, 'keep');
  await fsp.symlink(outside, path.join(runtime, 'venv', 'bin', 'python'));
  await fsp.mkdir(path.join(env.SKS_HOME!, 'decisions'), { recursive: true });
  await fsp.writeFile(path.join(env.SKS_HOME!, 'decisions', 'config.json'), '{"schema":"sks.jev-decision-config.v1"}\n');
  await fsp.mkdir(socketDir, { recursive: true });
  await fsp.writeFile(path.join(socketDir, 'worker.sock'), '');

  const result = await removeRetiredLocalDecisionRuntime(env, { socketDir });
  assert.equal(result.ok, true, result.blockers.join(','));
  assert.equal(result.detail.removed_runtime, true);
  assert.equal(result.detail.removed_socket_dir, true);
  await assert.rejects(fsp.access(runtime));
  await assert.rejects(fsp.access(socketDir));
  assert.equal(await fsp.readFile(outside, 'utf8'), 'keep');
  assert.equal(await fsp.readFile(path.join(env.SKS_HOME!, 'decisions', 'config.json'), 'utf8'), '{"schema":"sks.jev-decision-config.v1"}\n');
});

test('a symlink at the runtime path is unlinked without deleting its target', async (t) => {
  const { env, socketDir } = await fixture(t);
  const target = path.join(env.SKS_HOME!, 'real-target');
  const runtime = path.join(env.SKS_HOME!, 'local-decision');
  await fsp.mkdir(env.SKS_HOME!, { recursive: true });
  await fsp.mkdir(target, { recursive: true });
  await fsp.writeFile(path.join(target, 'keep.txt'), 'keep');
  await fsp.symlink(target, runtime);
  const result = await removeRetiredLocalDecisionRuntime(env, { socketDir });
  assert.equal(result.ok, true, result.blockers.join(','));
  await assert.rejects(fsp.lstat(runtime));
  assert.equal(await fsp.readFile(path.join(target, 'keep.txt'), 'utf8'), 'keep');
});

test('an unmarked explicit root is preserved and a marked one is removed', async (t) => {
  const { env, socketDir } = await fixture(t);
  const unmarked = path.join(env.SKS_HOME!, 'custom-unmarked');
  const marked = path.join(env.SKS_HOME!, 'custom-marked');
  await fsp.mkdir(unmarked, { recursive: true });
  await fsp.writeFile(path.join(unmarked, 'notes.txt'), 'keep');
  await fsp.mkdir(marked, { recursive: true });
  await fsp.writeFile(path.join(marked, 'config.json'), JSON.stringify({ schemaVersion: 1, mode: 'shadow' }));
  await fsp.writeFile(path.join(marked, 'install-receipt.json'), JSON.stringify({ schemaVersion: 1 }));

  const preserved = await removeRetiredLocalDecisionRuntime({
    ...env,
    SKS_LOCAL_DECISION_ROOT: unmarked
  }, { socketDir });
  assert.equal(preserved.ok, true, preserved.blockers.join(','));
  assert.equal(await fsp.readFile(path.join(unmarked, 'notes.txt'), 'utf8'), 'keep');

  const removed = await removeRetiredLocalDecisionRuntime({
    ...env,
    SKS_LOCAL_DECISION_ROOT: marked
  }, { socketDir });
  assert.equal(removed.ok, true, removed.blockers.join(','));
  await assert.rejects(fsp.access(marked));
});

test('a recorded local-decision worker is stopped', async (t) => {
  const { env, socketDir } = await fixture(t);
  const runtime = path.join(env.SKS_HOME!, 'local-decision', 'runtime');
  await fsp.mkdir(runtime, { recursive: true });
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000); // sks_local_decision'], { stdio: 'ignore' });
  t.after(() => { try { child.kill('SIGKILL'); } catch { /* already stopped */ } });
  if (!child.pid) await new Promise((resolve) => child.once('spawn', resolve));
  await fsp.writeFile(path.join(runtime, 'service.json'), JSON.stringify({ pid: child.pid }));
  const result = await removeRetiredLocalDecisionRuntime(env, { socketDir });
  assert.equal(result.ok, true, result.blockers.join(','));
  assert.equal(result.detail.stopped_worker, true);
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('worker did not exit')), 2000);
    if (child.exitCode !== null || child.signalCode) {
      clearTimeout(timer);
      resolve(null);
      return;
    }
    child.once('exit', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
  assert.equal(child.exitCode, null);
  assert.equal(child.signalCode, 'SIGTERM');
});

test('a home without an SKS state directory has nothing to retire and does not block update', async (t) => {
  const { env, socketDir } = await fixture(t);
  await fsp.mkdir(env.HOME!, { recursive: true });
  const result = await removeRetiredLocalDecisionRuntime({ HOME: env.HOME, PATH: env.PATH }, { socketDir });
  assert.equal(result.ok, true, result.blockers.join(','));
  assert.deepEqual(result.blockers, []);
  assert.equal(result.detail.removed_runtime, false);
});

test('the retired Local LLM config is removed only when it carries its own schema', async (t) => {
  const { env, socketDir } = await fixture(t);
  await fsp.mkdir(env.SKS_HOME!, { recursive: true });
  const file = path.join(env.SKS_HOME!, 'local-model.json');
  await fsp.writeFile(file, JSON.stringify({ schema: 'sks.local-model-config.v2', provider: 'ollama', status: 'disabled' }));
  const removed = await removeRetiredLocalDecisionRuntime(env, { socketDir });
  assert.equal(removed.ok, true, removed.blockers.join(','));
  assert.equal(removed.detail.removed_local_model_config, true);
  await assert.rejects(fsp.access(file));

  await fsp.writeFile(file, JSON.stringify({ schema: 'someone-elses.config.v1' }));
  const preserved = await removeRetiredLocalDecisionRuntime(env, { socketDir });
  assert.equal(preserved.ok, true);
  assert.equal(preserved.detail.removed_local_model_config, false);
  assert.ok(preserved.warnings.includes('retired_local_model_config_preserved_unrecognized'));
  assert.equal(JSON.parse(await fsp.readFile(file, 'utf8')).schema, 'someone-elses.config.v1');
});

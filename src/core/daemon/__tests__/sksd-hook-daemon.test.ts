import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import fsp from 'node:fs/promises';
import { callSksdHookDaemon, sksdSocketPath, startSksdHookDaemon } from '../sksd-hook-daemon.js';

async function tempRoot() {
  return fsp.mkdtemp(path.join(os.tmpdir(), 'sksd-hook-test-'));
}

test('callSksdHookDaemon: returns null (fail open) when no daemon is listening', async () => {
  const root = await tempRoot();
  const response = await callSksdHookDaemon(root, 'pre-tool', { cwd: root });
  assert.equal(response, null);
});

test('sksd hook daemon: real socket round-trip returns the handler result', async () => {
  const root = await tempRoot();
  const calls: Array<{ name: string; payload: unknown }> = [];
  const daemon = await startSksdHookDaemon(root, async (name, payload) => {
    calls.push({ name, payload });
    return { continue: true, echoed: payload };
  });
  assert.ok(daemon, 'daemon should have started (nothing else bound to this fresh root)');
  try {
    const response = await callSksdHookDaemon(root, 'pre-tool', { cwd: root, tool_name: 'Read' });
    assert.ok(response, 'daemon should have responded');
    assert.equal(response.ok, true);
    assert.deepEqual(response.result, { continue: true, echoed: { cwd: root, tool_name: 'Read' } });
    assert.equal(calls.length, 1);
    assert.equal(calls[0]?.name, 'pre-tool');
  } finally {
    await daemon!.close();
  }
});

test('sksd hook daemon: multiple sequential requests over the same warm daemon', async () => {
  const root = await tempRoot();
  let count = 0;
  const daemon = await startSksdHookDaemon(root, async () => {
    count += 1;
    return { continue: true, call_index: count };
  });
  assert.ok(daemon);
  try {
    const first = await callSksdHookDaemon(root, 'pre-tool', {});
    const second = await callSksdHookDaemon(root, 'post-tool', {});
    assert.deepEqual(first?.result, { continue: true, call_index: 1 });
    assert.deepEqual(second?.result, { continue: true, call_index: 2 });
  } finally {
    await daemon!.close();
  }
});

test('sksd hook daemon: a second startSksdHookDaemon for the same root is a no-op while the first is alive', async () => {
  const root = await tempRoot();
  const first = await startSksdHookDaemon(root, async () => ({ continue: true, who: 'first' }));
  assert.ok(first);
  try {
    const second = await startSksdHookDaemon(root, async () => ({ continue: true, who: 'second' }));
    assert.equal(second, null, 'must not start a duplicate daemon for a root that already has a live one');
    const response = await callSksdHookDaemon(root, 'pre-tool', {});
    assert.deepEqual(response?.result, { continue: true, who: 'first' }, 'the original daemon must still be the one serving requests');
  } finally {
    await first!.close();
  }
});

test('callSksdHookDaemon: a stale socket file with nothing listening fails open, not hangs', async () => {
  const root = await tempRoot();
  const socketPath = sksdSocketPath(root);
  await fsp.mkdir(path.dirname(socketPath), { recursive: true });
  // A leftover socket path with no listener behind it (simulating a daemon
  // that crashed without cleaning up) — connecting to it must fail fast.
  await fsp.writeFile(socketPath, '');
  const started = Date.now();
  const response = await callSksdHookDaemon(root, 'pre-tool', {});
  const elapsedMs = Date.now() - started;
  assert.equal(response, null);
  assert.ok(elapsedMs < 2000, `expected fast fail-open, took ${elapsedMs}ms`);
  await fsp.rm(socketPath, { force: true });
});

test('sksd hook daemon: after close(), a fresh daemon can start again for the same root', async () => {
  const root = await tempRoot();
  const first = await startSksdHookDaemon(root, async () => ({ continue: true, who: 'first' }));
  assert.ok(first);
  await first!.close();
  const second = await startSksdHookDaemon(root, async () => ({ continue: true, who: 'second' }));
  assert.ok(second, 'a new daemon should be able to bind the same socket once the old one is closed');
  try {
    const response = await callSksdHookDaemon(root, 'pre-tool', {});
    assert.deepEqual(response?.result, { continue: true, who: 'second' });
  } finally {
    await second!.close();
  }
});

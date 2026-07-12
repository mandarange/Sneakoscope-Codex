import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fsp from 'node:fs/promises';
import { claimHookInvocation } from '../hook-invocation-dedupe.js';
import { normalizeHookResult } from '../hook-io.js';
import fs from 'node:fs';

test('same host turn is claimed once across duplicate project and user hooks', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-dedupe-'));
  try {
    const payload = {
      session_id: 'session-1',
      turn_id: 'turn-1',
      hook_event_name: 'UserPromptSubmit',
      prompt: 'implement the repair'
    };
    const first = await claimHookInvocation(root, 'user-prompt-submit', payload);
    const second = await claimHookInvocation(root, 'user-prompt-submit', payload);
    assert.equal(first.claimed, true);
    assert.equal(first.duplicate, false);
    assert.equal(second.claimed, false);
    assert.equal(second.duplicate, true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('a later Stop payload with different assistant output is not collapsed', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-dedupe-stop-'));
  try {
    const base = { session_id: 'session-1', turn_id: 'turn-1' };
    const first = await claimHookInvocation(root, 'stop', { ...base, last_assistant_message: 'first result' });
    const next = await claimHookInvocation(root, 'stop', { ...base, last_assistant_message: 'continued result' });
    assert.equal(first.claimed, true);
    assert.equal(next.claimed, true);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
});

test('duplicate hook normalization is silent and cannot inject repeated feedback', () => {
  assert.deepEqual(normalizeHookResult('stop', { continue: true, suppressedDuplicate: true }), { continue: true });
  assert.deepEqual(normalizeHookResult('user-prompt-submit', { continue: true, suppressedDuplicate: true }), { continue: true });
  assert.deepEqual(normalizeHookResult('user-prompt-submit', { continue: true, silent: true }), { continue: true });
  assert.deepEqual(normalizeHookResult('stop', { continue: true, silent: true }), { continue: true });
});

test('daemon and inline dispatchers both use the deduplicating evaluator', () => {
  const dispatch = fs.readFileSync(new URL('../../daemon/sksd-hook-dispatch.js', import.meta.url), 'utf8');
  const daemon = fs.readFileSync(new URL('../../daemon/sksd-hook-daemon-entrypoint.js', import.meta.url), 'utf8');
  assert.match(dispatch, /evaluateHookPayloadOnce/);
  assert.match(daemon, /evaluateHookPayloadOnce/);
  assert.doesNotMatch(dispatch, /\{ evaluateHookPayload \}/);
  assert.doesNotMatch(daemon, /\{ evaluateHookPayload \}/);
});

test('dedupe refuses a symlinked state directory and never prunes external files', async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-dedupe-symlink-root-'));
  const victim = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-hook-dedupe-symlink-victim-'));
  try {
    const state = path.join(root, '.sneakoscope', 'state');
    await fsp.mkdir(state, { recursive: true });
    const externalDedupe = path.join(victim, 'dedupe');
    await fsp.mkdir(externalDedupe);
    const precious = path.join(externalDedupe, 'precious.txt');
    await fsp.writeFile(precious, 'keep\n');
    await fsp.symlink(externalDedupe, path.join(state, 'hook-invocation-dedupe'));

    await assert.rejects(
      () => claimHookInvocation(root, 'user-prompt-submit', { session_id: 's', turn_id: 't', prompt: 'implement task' }),
      /unsafe_hook_dedupe_directory/
    );
    assert.equal(await fsp.readFile(precious, 'utf8'), 'keep\n');
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
    await fsp.rm(victim, { recursive: true, force: true });
  }
});

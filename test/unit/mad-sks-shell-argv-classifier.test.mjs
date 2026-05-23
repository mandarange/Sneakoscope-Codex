import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { classifyMadSksShellArgv, parseShellLike } from '../../dist/core/mad-sks/shell-argv-classifier.js';

const root = path.resolve('.');

test('MAD-SKS shell parser keeps quoted shell metacharacters inside argv tokens', () => {
  const parsed = parseShellLike('node -e "console.log(1;2)"');

  assert.deepEqual(parsed.argv, ['node', '-e', 'console.log(1;2)']);
  assert.deepEqual(parsed.metacharacters, []);
});

test('MAD-SKS argv classifier does not treat argv strings as shell syntax', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-argv-'));
  const classified = await classifyMadSksShellArgv({
    argv: ['node', '-e', 'console.log("a;b")'],
    cwd: targetRoot,
    targetRoot,
    root
  });

  assert.equal(classified.ok, true);
  assert.equal(classified.action, 'allow');
  assert.deepEqual(classified.metacharacters, []);
});

test('MAD-SKS shell classifier blocks protected-core command targets', async () => {
  const classified = await classifyMadSksShellArgv({
    command: 'echo hi; rm -rf src/core',
    cwd: root,
    targetRoot: root,
    root
  });

  assert.equal(classified.ok, false);
  assert.equal(classified.action, 'block');
  assert.ok(classified.reasons.includes('semicolon_chained_command'));
  assert.ok(classified.reasons.includes('command_mentions_protected_core_path'));
});

test('MAD-SKS shell classifier routes service commands before generic package commands', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-service-route-'));
  const classified = await classifyMadSksShellArgv({
    argv: ['npm', 'run', 'dev'],
    cwd: targetRoot,
    targetRoot,
    root
  });

  assert.equal(classified.ok, true);
  assert.equal(classified.route_to_executor, 'service_control');
});

test('MAD-SKS shell classifier detects glob and environment expansion risk', async () => {
  const targetRoot = await fsp.mkdtemp(path.join(os.tmpdir(), 'mad-sks-shell-risk-'));
  const classified = await classifyMadSksShellArgv({
    command: 'echo $TOKEN ./src/*.ts',
    cwd: targetRoot,
    targetRoot,
    root
  });

  assert.equal(classified.ok, true);
  assert.equal(classified.action, 'confirm');
  assert.ok(classified.reasons.includes('environment_expansion'));
  assert.ok(classified.reasons.includes('glob_expansion'));
});

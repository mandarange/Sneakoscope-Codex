import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

import { buildFeatureRegistry } from '../../dist/core/feature-registry.js';

const root = process.cwd();
const cli = path.join(root, 'dist', 'bin', 'sks.js');

function runCli(args) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-removed-telegram-'));
  try {
    return spawnSync(process.execPath, [cli, ...args], {
      cwd: root,
      encoding: 'utf8',
      timeout: 30_000,
      env: {
        ...process.env,
        HOME: home,
        CODEX_HOME: path.join(home, '.codex'),
        SKS_CODEX_HOME: path.join(home, '.codex')
      }
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

test('sks telegram follows the ordinary unknown-command contract', () => {
  const result = runCli(['telegram', 'status', '--json']);

  assert.equal(result.status, 1, `${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(
    {
      ok: output.ok,
      status: output.status,
      command: output.command,
      reason: output.reason
    },
    {
      ok: false,
      status: 'blocked',
      command: 'telegram',
      reason: 'unknown_command'
    }
  );
  assert.match(result.stderr, /Unknown command: telegram/);
});

test('Doctor JSON has no Telegram readiness projection', () => {
  const result = runCli(['doctor', '--json']);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const output = JSON.parse(result.stdout);

  assert.equal(Object.hasOwn(output, 'telegram_remote'), false);
  assert.equal(JSON.stringify(output).toLowerCase().includes('telegram'), false);
});

test('public feature inventory has no Telegram transport', async () => {
  const registry = await buildFeatureRegistry({ root });
  const serialized = JSON.stringify(registry).toLowerCase();

  assert.equal(registry.source_inventory.cli_command_names.includes('telegram'), false);
  assert.equal(registry.source_inventory.handler_keys.includes('telegram'), false);
  assert.equal(registry.features.some((feature) => feature.id === 'cli-telegram'), false);
  assert.equal(serialized.includes('telegram'), false);
});

test('npm pack exposes no Telegram command, runtime, or native source', () => {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts', '--json'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);

  const [pack] = JSON.parse(result.stdout);
  assert.ok(pack && Array.isArray(pack.files), 'npm pack must return a JSON file list');
  const telegramPaths = pack.files
    .map((file) => file.path)
    .filter((packedPath) => /(?:^|\/)telegram/i.test(packedPath));
  assert.deepEqual(telegramPaths, []);

  // The Remote Coding page went with it in 10.7.2: absent from the pack.
  assert.equal(pack.files.some((file) => /RemoteCoding/.test(file.path)), false);
});

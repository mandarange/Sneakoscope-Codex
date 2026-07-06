import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const distCli = path.join(repoRoot, 'dist', 'bin', 'sks.js');
const testEnv = {
  ...process.env,
  CI: 'true',
  SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
  SKS_UPDATE_MIGRATION_GATE_DISABLED: '1'
};

test('dollar command list exposes only the canonical Super-Search source route', () => {
  const result = spawnSync(process.execPath, [distCli, 'dollar-commands', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: testEnv
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  const commands = new Set(parsed.dollar_commands.map((entry) => entry.command));
  assert.ok(commands.has('$Super-Search'));
  assert.equal(commands.has(['$Insane', 'Search'].join('-')), false);
  assert.equal(commands.has(['$Ultra', 'Search'].join('-')), false);
  assert.ok(parsed.app_skill_aliases.some((entry) => entry.canonical === '$Super-Search' && entry.app_skill === '$super-search'));
});

test('$Super-Search executes through the super-search CLI path', async () => {
  const cwd = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-super-search-dollar-'));
  const result = spawnSync(process.execPath, [distCli, 'run', '$Super-Search doctor', '--execute', '--json'], {
    cwd,
    encoding: 'utf8',
    env: testEnv
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const parsed = JSON.parse(result.stdout);
  assert.equal(parsed.route, '$Super-Search');
  assert.equal(parsed.execution.execution_kind, 'live_route');
  assert.match(parsed.execution.command, /sks super-search doctor/);
});

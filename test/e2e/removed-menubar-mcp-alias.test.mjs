import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { runProcess } from '../../dist/core/fsx.js';
import { createHermeticProjectRoot } from './route-real-command-helper.mjs';

const sourceRoot = process.cwd();

test('the removed menu bar MCP namespace fails closed while the canonical MCP command remains available', async () => {
  const root = await createHermeticProjectRoot({ fixtureName: 'removed-menubar-mcp-alias', setup: false });
  const home = path.join(root, '.home');
  const globalRoot = path.join(root, '.sneakoscope-global');
  const configPath = path.join(home, '.codex', 'config.toml');
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, '[mcp_servers.keep]\ncommand = "node"\n', { mode: 0o600 });

  const env = {
    SKS_SKIP_NPM_FRESHNESS_CHECK: '1',
    SKS_TEST_ISOLATION: '1',
    SKS_UPDATE_MIGRATION_GATE_DISABLED: '1',
    SKS_GLOBAL_ROOT: globalRoot,
    HOME: home,
    CODEX_HOME: path.join(home, '.codex'),
    CI: 'true'
  };
  const entrypoint = path.join(sourceRoot, 'dist', 'bin', 'sks.js');

  const removed = await runProcess(process.execPath, [entrypoint, 'menubar', 'mcp', 'list', '--json'], {
    cwd: root,
    timeoutMs: 120_000,
    maxOutputBytes: 512 * 1024,
    env
  });
  assert.equal(removed.code, 1, removed.stderr || removed.stdout);
  assert.equal(removed.stderr, '');
  const removedResult = JSON.parse(removed.stdout);
  assert.equal(removedResult.ok, false);
  assert.equal(removedResult.status, 'unknown_subcommand');
  assert.equal(removedResult.reason, 'unknown_subcommand');
  assert.equal(removedResult.command, 'menubar');
  assert.equal(removedResult.subcommand, 'mcp');
  assert.equal(Object.hasOwn(removedResult, 'replacement'), false);
  assert.doesNotMatch(removed.stdout, /Deprecated|sks mcp config/);
  assert.equal(await fs.readFile(configPath, 'utf8'), '[mcp_servers.keep]\ncommand = "node"\n');

  const help = await runProcess(process.execPath, [entrypoint, 'menubar', 'help'], {
    cwd: root,
    timeoutMs: 120_000,
    maxOutputBytes: 512 * 1024,
    env
  });
  assert.equal(help.code, 0, help.stderr || help.stdout);
  assert.doesNotMatch(help.stdout, /menubar\s+mcp/);

  const canonical = await runProcess(process.execPath, [
    entrypoint,
    'mcp', 'config', 'list', '--scope', 'global', '--home', home,
    '--codex', path.join(root, 'missing-codex'), '--json'
  ], {
    cwd: root,
    timeoutMs: 120_000,
    maxOutputBytes: 512 * 1024,
    env
  });
  assert.equal(canonical.code, 0, canonical.stderr || canonical.stdout);
  const canonicalResult = JSON.parse(canonical.stdout);
  assert.equal(canonicalResult.ok, true);
  assert.deepEqual(canonicalResult.servers.map((server) => server.name), ['keep']);
});

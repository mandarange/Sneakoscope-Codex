import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { COMMANDS } from '../../../cli/command-registry.js';
import { ensureCurrentMigrationBeforeCommand } from '../../update/update-migration-state.js';
import { executeMcpConfigCommand, isMcpCommandSuccess, parseMcpStdinJson } from '../mcp-config-command.js';

async function fixture(t: test.TestContext) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-command-'));
  const home = path.join(root, 'home');
  const projectRoot = path.join(root, 'project');
  await fsp.mkdir(path.join(home, '.codex'), { recursive: true });
  await fsp.mkdir(path.join(projectRoot, '.codex'), { recursive: true });
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return {
    root,
    home,
    projectRoot,
    codex: path.join(root, 'missing-codex'),
    globalConfig: path.join(home, '.codex', 'config.toml'),
    projectConfig: path.join(projectRoot, '.codex', 'config.toml'),
    pluginInventory: path.join(projectRoot, '.sneakoscope', 'mcp-plugin-server-candidates.json')
  };
}

test('mcp config command lists global, project, and effective inventories', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, '[mcp_servers.global_docs]\ncommand = "node"\n', { mode: 0o600 });
  await fsp.writeFile(s.projectConfig, '[mcp_servers.project_docs]\nurl = "https://project.example.test/mcp"\n', { mode: 0o600 });
  await fsp.mkdir(path.dirname(s.pluginInventory), { recursive: true });
  await fsp.writeFile(s.pluginInventory, JSON.stringify({
    schema: 'sks.mcp-plugin-server-candidates.v1',
    candidates: [{ name: 'plugin_docs', plugin_id: 'docs', url: 'https://plugin.example.test/mcp', auth_type: 'oauth' }]
  }));

  const global = await executeMcpConfigCommand(['config', 'list', '--scope', 'global', '--home', s.home, '--codex', s.codex]) as any;
  assert.equal(global.ok, true);
  assert.deepEqual(global.servers.map((server: any) => server.name), ['global_docs']);

  const project = await executeMcpConfigCommand([
    'config', 'list', '--scope', 'project', '--project-root', s.projectRoot, '--trusted-project', '--codex', s.codex
  ]) as any;
  assert.equal(project.ok, true);
  assert.deepEqual(project.servers.map((server: any) => server.name), ['project_docs']);

  const previousCwd = process.cwd();
  process.chdir(s.projectRoot);
  t.after(() => process.chdir(previousCwd));
  const effective = await executeMcpConfigCommand([
    'config', 'list', '--scope', 'effective', '--home', s.home,
    '--plugin-inventory', s.pluginInventory, '--trusted-project', '--codex', s.codex
  ]) as any;
  assert.equal(effective.ok, true);
  assert.deepEqual(effective.servers.map((server: any) => server.name), ['global_docs', 'plugin_docs', 'project_docs']);
});

test('effective inventory refuses to merge an untrusted project config', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, '[mcp_servers.global_docs]\ncommand = "node"\n', { mode: 0o600 });
  await fsp.writeFile(s.projectConfig, '[mcp_servers.project_docs]\ncommand = "node"\n', { mode: 0o600 });
  const result = await executeMcpConfigCommand([
    'config', 'list', '--scope', 'effective', '--home', s.home,
    '--project-root', s.projectRoot, '--codex', s.codex
  ]) as any;
  assert.equal(result.ok, false);
  assert.ok(result.blockers.includes('mcp_project_not_trusted'));
  assert.deepEqual(result.servers.map((server: any) => server.name), ['global_docs']);
});

test('mcp config command rejects raw secret payloads before any mutation', async (t) => {
  const s = await fixture(t);
  const result = await executeMcpConfigCommand([
    'config', 'add', '--scope', 'global', '--home', s.home, '--stdin-json', '--codex', s.codex
  ], {
    stdinJson: { name: 'unsafe', transport: 'stdio', command: 'node', env: { TOKEN: 'super-secret' } }
  }) as any;
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, ['mcp_raw_secret_storage_forbidden']);
  assert.doesNotMatch(JSON.stringify(result), /super-secret/);
});

test('project mutations require trust and explicit confirmation', async (t) => {
  const s = await fixture(t);
  const input = { stdinJson: { name: 'docs', transport: 'stdio', command: 'node' } };
  const untrusted = await executeMcpConfigCommand([
    'config', 'add', '--scope', 'project', '--project-root', s.projectRoot, '--stdin-json', '--codex', s.codex
  ], input) as any;
  assert.deepEqual(untrusted.blockers, ['mcp_project_not_trusted']);

  const unconfirmed = await executeMcpConfigCommand([
    'config', 'add', '--scope', 'project', '--project-root', s.projectRoot, '--trusted-project', '--stdin-json', '--codex', s.codex
  ], input) as any;
  assert.deepEqual(unconfirmed.blockers, ['mcp_project_mutation_confirmation_required']);
});

test('stdin JSON parser rejects empty, invalid, and oversized payloads', () => {
  assert.throws(() => parseMcpStdinJson(''), /mcp_stdin_json_required/);
  assert.throws(() => parseMcpStdinJson('{not-json'), /mcp_stdin_json_invalid/);
  assert.throws(() => parseMcpStdinJson(Buffer.alloc(64 * 1024 + 1, 0x20)), /mcp_stdin_json_too_large/);
  assert.deepEqual(parseMcpStdinJson('{"name":"docs"}'), { name: 'docs' });
});

test('MCP health command exit semantics treat actionable non-error states as success', () => {
  for (const status of ['healthy', 'disabled', 'oauth_required']) {
    assert.equal(isMcpCommandSuccess({ schema: 'sks.mcp-health.v1', status }), true);
  }
  for (const status of ['startup_failed', 'timeout', 'protocol_error', 'unknown']) {
    assert.equal(isMcpCommandSuccess({ schema: 'sks.mcp-health.v1', status }), false);
  }
});

test('mcp command bypasses migration gate for local config operations', async () => {
  assert.equal(COMMANDS.mcp.skipMigrationGate, true);
  const result = await ensureCurrentMigrationBeforeCommand({
    command: 'mcp',
    args: ['config', 'get', '--scope', 'global', 'docs'],
    cwd: process.cwd(),
    env: {
      ...process.env,
      SKS_REQUIRE_UPDATE_MIGRATION_RECEIPT: '1',
      SKS_UPDATE_MIGRATION_GATE_DISABLED: '0'
    }
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'skipped');
  assert.ok(result.warnings.some((warning) => warning === 'skip_migration_gate_command:mcp'));
});

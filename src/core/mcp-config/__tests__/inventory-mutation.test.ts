import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCodexConfigToml } from '../../codex/codex-config-toml.js';
import { listMcpBackups } from '../backup.js';
import type { CodexCliMutationOperation, CodexMcpCliPort } from '../codex-cli-adapter.js';
import { removeMcpServerText } from '../guarded-patch.js';
import { listMcpInventory } from '../inventory.js';
import { addMcpServer, duplicateMcpServer, editMcpServer, setMcpServerEnabled } from '../mutation.js';
import { redactMcpError, sanitizeMcpArgs } from '../redaction.js';
import { restoreMcpBackup } from '../restore.js';
import { resolveMcpScope } from '../scope.js';

class FakeCli implements CodexMcpCliPort {
  transformCalls: CodexCliMutationOperation[] = [];
  loginCalls: string[] = [];
  onTransform: ((before: string, operation: CodexCliMutationOperation, count: number) => Promise<void> | void) | null = null;
  available = true;

  async list() { return { available: this.available, ok: this.available, rows: [], public_error: this.available ? null : 'codex_cli_not_found' }; }
  async transform(before: string, operation: CodexCliMutationOperation) {
    this.transformCalls.push(operation);
    await this.onTransform?.(before, operation, this.transformCalls.length);
    if (!this.available) {
      return { available: false, ok: false, used: false, text: null, unsupported_reason: 'codex_cli_not_found', public_error: null };
    }
    return {
      available: true,
      ok: true,
      used: true,
      text: operation.action === 'remove' ? removeMcpServerText(before, operation.name) || '' : before,
      unsupported_reason: null,
      public_error: null
    };
  }
  async login(_ref: unknown, name: string) { this.loginCalls.push(name); return { available: true, ok: true, public_error: null }; }
  async logout() { return { available: true, ok: true, public_error: null }; }
}

async function fixture(t: test.TestContext) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-v2-'));
  const home = path.join(root, 'home');
  const projectRoot = path.join(root, 'project');
  await fsp.mkdir(path.join(home, '.codex'), { recursive: true });
  await fsp.mkdir(path.join(projectRoot, '.codex'), { recursive: true });
  t.after(async () => fsp.rm(root, { recursive: true, force: true }));
  return {
    root, home, projectRoot,
    globalConfig: path.join(home, '.codex', 'config.toml'),
    projectConfig: path.join(projectRoot, '.codex', 'config.toml')
  };
}

test('global, project, and effective inventory expose current defaults and project shadowing', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, [
    '[mcp_servers.shared]',
    'command = "node"',
    'env_vars = ["GLOBAL_TOKEN"]',
    'default_tools_approval_mode = "writes"',
    ''
  ].join('\n'), { mode: 0o600 });
  await fsp.writeFile(s.projectConfig, [
    '[mcp_servers.shared]',
    'url = "https://project.example.test/mcp"',
    'default_tools_approval_mode = "approve"',
    '',
    '[mcp_servers.project_only]',
    'command = "node"',
    'startup_timeout_sec = 7',
    ''
  ].join('\n'), { mode: 0o600 });
  const cli = new FakeCli();
  const effective = await listMcpInventory('effective', {
    home: s.home,
    projectRoot: s.projectRoot,
    projectTrusted: true,
    cli,
    pluginServers: [{ name: 'plugin_docs', url: 'https://plugin.example.test/private', sourcePath: 'plugin:docs' }]
  });
  assert.equal(effective.ok, true);
  assert.deepEqual(effective.servers.map((server) => server.name), ['plugin_docs', 'project_only', 'shared']);
  const shared = effective.servers.find((server) => server.name === 'shared');
  assert.equal(shared?.scope, 'project');
  assert.equal(shared?.transport, 'streamable-http');
  assert.equal(shared?.startup_timeout_sec, 10);
  assert.equal(shared?.tool_timeout_sec, 60);
  assert.equal(shared?.default_tools_approval_mode, 'approve');
  assert.deepEqual(shared?.shadowed_sources?.map((entry) => entry.scope), ['global']);
});

test('project inventory and mutations fail closed for untrusted or symlink-escaped config', async (t) => {
  const s = await fixture(t);
  const untrusted = await listMcpInventory('project', { projectRoot: s.projectRoot, projectTrusted: false, cli: new FakeCli() });
  assert.deepEqual(untrusted.blockers, ['mcp_project_not_trusted']);

  await fsp.rm(path.join(s.projectRoot, '.codex'), { recursive: true });
  const outside = path.join(s.root, 'outside');
  await fsp.mkdir(outside, { recursive: true });
  await fsp.symlink(outside, path.join(s.projectRoot, '.codex'));
  const escaped = await listMcpInventory('project', { projectRoot: s.projectRoot, projectTrusted: true, cli: new FakeCli() });
  assert.ok(escaped.blockers.includes('mcp_project_codex_home_symlink_refused'));
});

test('new mutations reject raw secrets, sensitive argv, sensitive URLs, and obsolete deny mode', async (t) => {
  const s = await fixture(t);
  const cli = new FakeCli();
  const bareProviderToken = 'sk-proj-1234567890abcdefghijklmnop';
  const githubToken = 'ghp_1234567890abcdefghijklmnopqrstuv';
  const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signaturevalue';
  const cases = [
    { input: { name: 'raw_env', transport: 'stdio', command: 'node', env: { TOKEN: 'secret' } }, blocker: 'mcp_raw_secret_storage_forbidden' },
    { input: { name: 'raw_arg', transport: 'stdio', command: 'node', args: ['--token', 'secret'] }, blocker: 'mcp_inline_secret_argument_forbidden' },
    { input: { name: 'credential_arg', transport: 'stdio', command: 'node', args: ['--credential', bareProviderToken] }, blocker: 'mcp_inline_secret_argument_forbidden' },
    { input: { name: 'bare_provider', transport: 'stdio', command: 'node', args: [githubToken] }, blocker: 'mcp_inline_secret_argument_forbidden' },
    { input: { name: 'bare_jwt', transport: 'stdio', command: 'node', args: [jwt] }, blocker: 'mcp_inline_secret_argument_forbidden' },
    { input: { name: 'raw_url', transport: 'streamable-http', url: 'https://example.test/mcp?token=secret' }, blocker: 'mcp_url_secret_forbidden' },
    { input: { name: 'old_mode', transport: 'stdio', command: 'node', default_tools_approval_mode: 'deny' }, blocker: 'obsolete_mcp_approval_mode_deny' }
  ];
  for (const row of cases) {
    const outcome = await addMcpServer(row.input, 'global', { home: s.home, cli });
    assert.equal(outcome.ok, false);
    assert.ok(outcome.blockers.includes(row.blocker));
  }
  assert.equal(cli.transformCalls.length, 0);
  assert.deepEqual(sanitizeMcpArgs(['--credential', bareProviderToken, githubToken, jwt]), [
    '<redacted>', '<redacted>', '<redacted>', '<redacted>'
  ]);
  assert.doesNotMatch(redactMcpError(`failed ${bareProviderToken} ${githubToken} ${jwt}`), /sk-proj-|ghp_|eyJ/);
});

test('official CLI is primary for add/edit and guarded config carries current policy fields', async (t) => {
  const s = await fixture(t);
  const cli = new FakeCli();
  const previousToken = process.env.MCP_TOKEN;
  process.env.MCP_TOKEN = 'runtime-secret-must-not-inline';
  t.after(() => {
    if (previousToken === undefined) delete process.env.MCP_TOKEN;
    else process.env.MCP_TOKEN = previousToken;
  });
  const added = await addMcpServer({
    name: 'local_tools', transport: 'stdio', command: 'node', args: ['server.js'], env_vars: ['MCP_TOKEN'],
    cwd: s.projectRoot, startup_timeout_sec: 8, tool_timeout_sec: 45,
    enabled_tools: ['read'], disabled_tools: ['write'], default_tools_approval_mode: 'writes',
    tool_approval_modes: { read: 'auto', write: 'approve' }, required: true
  }, 'global', { home: s.home, cli });
  assert.equal(added.ok, true);
  assert.equal(added.official_cli_used, true);
  assert.equal(added.fallback_used, false);
  assert.equal(cli.transformCalls[0]?.action, 'add');
  const parsed = parseCodexConfigToml(await fsp.readFile(s.globalConfig, 'utf8'));
  const server = parsed.mcp_servers?.local_tools;
  assert.deepEqual(server.env_vars, ['MCP_TOKEN']);
  assert.equal(server.env, undefined);
  assert.equal(server.default_tools_approval_mode, 'writes');
  assert.equal(server.tools?.write?.approval_mode, 'approve');
  assert.equal(server.required, true);

  const edited = await editMcpServer('local_tools', { tool_timeout_sec: 60, default_tools_approval_mode: 'approve' }, 'global', { home: s.home, cli });
  assert.equal(edited.ok, true);
  assert.equal(cli.transformCalls.at(-1)?.action, 'edit');
  const after = parseCodexConfigToml(await fsp.readFile(s.globalConfig, 'utf8'));
  assert.equal(after.mcp_servers?.local_tools?.tool_timeout_sec, 60);
  assert.equal(after.mcp_servers?.local_tools?.default_tools_approval_mode, 'approve');
  assert.equal(after.mcp_servers?.local_tools?.env, undefined);
  assert.doesNotMatch(await fsp.readFile(s.globalConfig, 'utf8'), /runtime-secret-must-not-inline/);
});

test('CLI-unavailable fallback is guarded and project mutation requires explicit confirmation', async (t) => {
  const s = await fixture(t);
  const cli = new FakeCli();
  cli.available = false;
  const unconfirmed = await addMcpServer({ name: 'project_tools', transport: 'stdio', command: 'node' }, 'project', {
    projectRoot: s.projectRoot, projectTrusted: true, cli
  });
  assert.deepEqual(unconfirmed.blockers, ['mcp_project_mutation_confirmation_required']);
  const added = await addMcpServer({ name: 'project_tools', transport: 'stdio', command: 'node' }, 'project', {
    projectRoot: s.projectRoot, projectTrusted: true, confirmProjectMutation: true, cli
  });
  assert.equal(added.ok, true);
  assert.equal(added.official_cli_used, false);
  assert.equal(added.fallback_used, true);
});

test('empty config and CRLF multiline comments round-trip through guarded CLI fallback', async (t) => {
  const s = await fixture(t);
  const cli = new FakeCli();
  cli.available = false;

  await fsp.writeFile(s.globalConfig, '', { mode: 0o600 });
  const empty = await listMcpInventory('global', { home: s.home, cli });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.servers, []);

  const original = [
    '# preserve this comment',
    '[settings]',
    'banner = """line one',
    '[mcp_servers.not_a_header]',
    'line three"""',
    ''
  ].join('\r\n');
  await fsp.writeFile(s.globalConfig, original, { mode: 0o600 });
  const added = await addMcpServer({ name: 'docs', transport: 'stdio', command: 'node' }, 'global', {
    home: s.home,
    cli
  });
  assert.equal(added.ok, true);
  assert.equal(added.official_cli_used, false);
  assert.equal(added.fallback_used, true);
  const after = await fsp.readFile(s.globalConfig, 'utf8');
  assert.match(after, /^# preserve this comment\r\n\[settings\]/);
  assert.match(after, /banner = """line one\r\n\[mcp_servers\.not_a_header\]\r\nline three"""/);
  assert.match(after, /\r\n\r\n\[mcp_servers\."docs"\]\r\n/);
  assert.doesNotMatch(after, /(^|[^\r])\n/);
  assert.equal(parseCodexConfigToml(after).mcp_servers?.docs?.command, 'node');
});

test('unreadable config fails closed without falling back to an empty document', async (t) => {
  if (process.platform === 'win32') return t.skip('POSIX permission semantics required');
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, '[mcp_servers.docs]\ncommand = "node"\n', { mode: 0o600 });
  if (process.getuid?.() === 0) {
    await fsp.rm(s.globalConfig, { force: true });
    await fsp.mkdir(s.globalConfig);
    t.after(() => fsp.rm(s.globalConfig, { recursive: true, force: true }).catch(() => undefined));
  } else {
    await fsp.chmod(s.globalConfig, 0o000);
    t.after(() => fsp.chmod(s.globalConfig, 0o600).catch(() => undefined));
  }
  const result = await listMcpInventory('global', { home: s.home, cli: new FakeCli() });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, ['mcp_config_read_failed']);
  assert.deepEqual(result.servers, []);
});

test('concurrent external write is preserved and mutation retries from the new base', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, '[mcp_servers.before]\ncommand = "node"\n', { mode: 0o600 });
  const cli = new FakeCli();
  cli.onTransform = async (_before, _operation, count) => {
    if (count === 1) await fsp.writeFile(s.globalConfig, '[mcp_servers.external]\ncommand = "node"\n', { mode: 0o600 });
  };
  const added = await addMcpServer({ name: 'manager', transport: 'stdio', command: 'node' }, 'global', { home: s.home, cli });
  assert.equal(added.ok, true);
  assert.equal(added.attempts, 2);
  const parsed = parseCodexConfigToml(await fsp.readFile(s.globalConfig, 'utf8'));
  assert.equal(parsed.mcp_servers?.external?.command, 'node');
  assert.equal(parsed.mcp_servers?.manager?.command, 'node');
});

test('legacy inline secrets are preserved on edit, never duplicated, and never serialized in results', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.globalConfig, '[mcp_servers.legacy]\ncommand = "node"\nenv = { TOKEN = "super-secret" }\n', { mode: 0o600 });
  const cli = new FakeCli();
  const edited = await editMcpServer('legacy', { tool_timeout_sec: 90 }, 'global', { home: s.home, cli });
  assert.equal(edited.ok, true);
  assert.doesNotMatch(JSON.stringify(edited), /super-secret/);
  const preserved = parseCodexConfigToml(await fsp.readFile(s.globalConfig, 'utf8'));
  assert.equal(preserved.mcp_servers?.legacy?.env?.TOKEN, 'super-secret');
  const duplicate = await duplicateMcpServer('legacy', 'legacy_copy', 'global', { home: s.home, cli });
  assert.deepEqual(duplicate.blockers, ['mcp_duplicate_legacy_inline_secret_forbidden']);
});

test('backups are owner-only and restore returns the exact prior config', async (t) => {
  const s = await fixture(t);
  const original = '[mcp_servers.docs]\ncommand = "node"\ntool_timeout_sec = 60\n';
  await fsp.writeFile(s.globalConfig, original, { mode: 0o600 });
  const cli = new FakeCli();
  const edited = await editMcpServer('docs', { tool_timeout_sec: 90 }, 'global', { home: s.home, cli });
  assert.equal(edited.ok, true);
  assert.ok(edited.backup_id);
  const ref = await resolveMcpScope('global', { home: s.home });
  const backups = await listMcpBackups(ref);
  assert.equal(backups[0]?.id, edited.backup_id);
  const restored = await restoreMcpBackup(String(edited.backup_id), 'global', { home: s.home, cli });
  assert.equal(restored.ok, true);
  assert.equal(await fsp.readFile(s.globalConfig, 'utf8'), original);
  const backupDir = path.join(s.home, '.codex', 'backups', 'sks-mcp');
  for (const entry of await fsp.readdir(backupDir)) {
    assert.equal((await fsp.stat(path.join(backupDir, entry))).mode & 0o077, 0);
  }
});

test('toggle edits only the target table and preserves multiline header-like content', async (t) => {
  const s = await fixture(t);
  const original = [
    '[mcp_servers.real]', 'command = "node"', 'enabled = true # keep', '',
    '[mcp_servers.other]', 'command = "node"', '', '[mcp_servers.other.env]', 'CERT = """line1',
    '[mcp_servers.fake]', 'line2"""', ''
  ].join('\r\n');
  await fsp.writeFile(s.globalConfig, original, { mode: 0o600 });
  const changed = await setMcpServerEnabled('real', false, 'global', { home: s.home, cli: new FakeCli() });
  assert.equal(changed.ok, true);
  assert.equal(await fsp.readFile(s.globalConfig, 'utf8'), original.replace('enabled = true # keep', 'enabled = false # keep'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseCodexConfigToml } from '../../codex/codex-config-toml.js';
import { writeCodexConfigGuarded } from '../../codex/codex-config-guard.js';
import {
  addCodexMcpServer,
  codexMcpConfigPath,
  listCodexMcpServers,
  removeCodexMcpServer,
  setCodexMcpServerEnabled
} from '../mcp-manager.js';

test('menu bar MCP listing is static, fast-safe, and never exposes configured secrets', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-list-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, [
    'service_tier = "fast"',
    '',
    '[mcp_servers.context7]',
    'command = "node --token command-secret"',
    'args = ["-y", "@upstash/context7-mcp", "--token", "super-secret-argument"]',
    'env = { CONTEXT7_TOKEN = "super-secret-env" }',
    'enabled = false',
    '',
    '[mcp_servers.remote]',
    'url = "https://example.test/mcp/super-secret-path?project=demo&token=super-secret-query"',
    'bearer_token_env_var = "REMOTE_TOKEN"',
    ''
  ].join('\n'), { mode: 0o600 });

  const result = await listCodexMcpServers({ home });
  assert.equal(result.ok, true);
  assert.equal(result.source, 'config_toml_static');
  assert.equal(result.server_count, 2);
  assert.deepEqual(result.servers.map((server) => [server.name, server.enabled]), [
    ['context7', false],
    ['remote', true]
  ]);
  assert.equal(result.servers[0]?.argument_count, 4);
  assert.deepEqual(result.servers[0]?.env_keys, ['CONTEXT7_TOKEN']);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /super-secret-argument|super-secret-env|super-secret-query|super-secret-path|project=demo|command-secret/);
  assert.equal(result.servers[0]?.command, '[configured command]');
  assert.equal(result.servers[1]?.url, 'https://example.test/…');
});

test('menu bar MCP manager adds, toggles, and removes a server while preserving unrelated config', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-mutate-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, '# user comment\nservice_tier = "fast"\n', { mode: 0o600 });

  const added = await addCodexMcpServer({
    name: 'docs.remote',
    transport: 'url',
    url: 'https://mcp.example.test/service',
    bearer_token_env_var: 'DOCS_MCP_TOKEN',
    startup_timeout_sec: 8
  }, { home });
  assert.equal(added.ok, true);
  assert.equal(added.changed, true);
  const addedBackupPath = String((added as any).backup_path || '');
  assert.ok(addedBackupPath);
  assert.equal(await fs.readFile(addedBackupPath, 'utf8'), '# user comment\nservice_tier = "fast"\n');
  assert.equal((await fs.stat(addedBackupPath)).mode & 0o777, 0o600);

  const disabled = await setCodexMcpServerEnabled('docs.remote', false, { home });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.enabled, false);
  assert.equal(disabled.servers.find((server: any) => server.name === 'docs.remote')?.enabled, false);

  const enabled = await setCodexMcpServerEnabled('docs.remote', true, { home });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.servers.find((server: any) => server.name === 'docs.remote')?.enabled, true);

  const beforeRemove = await fs.readFile(configPath, 'utf8');
  const parsedBeforeRemove = parseCodexConfigToml(beforeRemove);
  assert.equal(parsedBeforeRemove.service_tier, 'fast');
  assert.equal(parsedBeforeRemove.mcp_servers?.['docs.remote']?.url, 'https://mcp.example.test/service');
  assert.equal(parsedBeforeRemove.mcp_servers?.['docs.remote']?.bearer_token_env_var, 'DOCS_MCP_TOKEN');
  assert.match(beforeRemove, /# user comment/);

  const removed = await removeCodexMcpServer('docs.remote', { home });
  assert.equal(removed.ok, true);
  const afterRemove = await fs.readFile(configPath, 'utf8');
  const parsedAfterRemove = parseCodexConfigToml(afterRemove);
  assert.equal(parsedAfterRemove.service_tier, 'fast');
  assert.equal(parsedAfterRemove.mcp_servers?.['docs.remote'], undefined);
  assert.match(afterRemove, /# user comment/);
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
});

test('menu bar MCP manager preserves concurrent additions through its config lock', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-concurrent-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, 'service_tier = "fast"\n', { mode: 0o600 });

  const [stdio, remote] = await Promise.all([
    addCodexMcpServer({
      name: 'local-tools',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@example/local-mcp'],
      env: { LOCAL_MCP_TOKEN: 'fixture-secret' }
    }, { home }),
    addCodexMcpServer({
      name: 'remote-tools',
      transport: 'url',
      url: 'https://remote.example.test/mcp'
    }, { home })
  ]);

  assert.equal(stdio.ok, true);
  assert.equal(remote.ok, true);
  const parsed = parseCodexConfigToml(await fs.readFile(configPath, 'utf8'));
  assert.equal(parsed.mcp_servers?.['local-tools']?.command, 'npx');
  assert.equal(parsed.mcp_servers?.['local-tools']?.env?.LOCAL_MCP_TOKEN, 'fixture-secret');
  assert.equal(parsed.mcp_servers?.['remote-tools']?.url, 'https://remote.example.test/mcp');
});

test('menu bar MCP manager fails closed for invalid input or malformed existing TOML', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-invalid-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });

  const invalid = await addCodexMcpServer({ name: '../escape', transport: 'stdio', command: 'node' }, { home });
  assert.equal(invalid.ok, false);
  assert.deepEqual(invalid.blockers, ['invalid_codex_mcp_server_name']);

  await fs.writeFile(configPath, '[mcp_servers.broken]\ncommand = "node"\nenv = { TOKEN = "SUPERSECRET"\n', { mode: 0o600 });
  const listed = await listCodexMcpServers({ home });
  assert.equal(listed.ok, false);
  assert.deepEqual(listed.blockers, ['codex_mcp_config_toml_parse_failed']);
  assert.doesNotMatch(JSON.stringify(listed), /SUPERSECRET/);
  const mutation = await setCodexMcpServerEnabled('broken', false, { home });
  assert.equal(mutation.ok, false);
  assert.deepEqual(mutation.blockers, ['codex_mcp_config_toml_parse_failed']);
  assert.doesNotMatch(JSON.stringify(mutation), /SUPERSECRET/);
});

test('menu bar MCP manager preserves intentionally empty environment values', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-empty-env-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));

  const added = await addCodexMcpServer({
    name: 'empty-env',
    transport: 'stdio',
    command: 'node',
    env: { OPTIONAL_VALUE: '' }
  }, { home });

  assert.equal(added.ok, true);
  const parsed = parseCodexConfigToml(await fs.readFile(codexMcpConfigPath(home), 'utf8'));
  assert.equal(parsed.mcp_servers?.['empty-env']?.env?.OPTIONAL_VALUE, '');
});

test('menu bar MCP manager fails closed when an existing config cannot be read', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-unreadable-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const original = '[mcp_servers.keep]\ncommand = "node"\nenv = { TOKEN = "must-survive" }\n';
  await fs.writeFile(configPath, original, { mode: 0o600 });
  await fs.chmod(configPath, 0o000);
  t.after(async () => fs.chmod(configPath, 0o600).catch(() => undefined));

  try {
    await fs.readFile(configPath, 'utf8');
    t.skip('filesystem does not enforce owner read permissions in this environment');
    return;
  } catch (error: any) {
    assert.match(String(error?.code || ''), /EACCES|EPERM/);
  }

  const listed = await listCodexMcpServers({ home });
  assert.equal(listed.ok, false);
  assert.deepEqual(listed.blockers, ['codex_mcp_config_read_failed']);

  const mutation = await addCodexMcpServer({
    name: 'new-server',
    transport: 'stdio',
    command: 'node'
  }, { home });
  assert.equal(mutation.ok, false);
  assert.deepEqual(mutation.blockers, ['codex_mcp_config_read_failed']);

  await fs.chmod(configPath, 0o600);
  assert.equal(await fs.readFile(configPath, 'utf8'), original);
});

test('menu bar MCP manager refuses to replace a symlinked Codex config', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-symlink-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  const targetPath = path.join(home, 'dotfiles', 'codex-config.toml');
  const original = '[mcp_servers.keep]\ncommand = "node"\n';
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, original, { mode: 0o600 });
  await fs.symlink(targetPath, configPath);

  const listed = await listCodexMcpServers({ home });
  assert.equal(listed.ok, false);
  assert.deepEqual(listed.blockers, ['codex_mcp_config_symlink_unsupported']);

  const mutation = await addCodexMcpServer({
    name: 'new-server',
    transport: 'stdio',
    command: 'node'
  }, { home });
  assert.equal(mutation.ok, false);
  assert.deepEqual(mutation.blockers, ['codex_mcp_config_symlink_unsupported']);
  assert.equal((await fs.lstat(configPath)).isSymbolicLink(), true);
  assert.equal(await fs.readFile(targetPath, 'utf8'), original);
});

test('menu bar MCP toggles preserve unrelated multiline TOML bytes and ignore header-like string content', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-multiline-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const original = [
    '[mcp_servers.real]',
    'command = "node"',
    'enabled = true # keep this comment',
    '',
    '[mcp_servers.other]',
    'command = "node"',
    '',
    '[mcp_servers.other.env]',
    'CERT = """line1',
    '',
    '',
    '[mcp_servers.fake]',
    'line2"""',
    ''
  ].join('\n');
  await fs.writeFile(configPath, original, { mode: 0o600 });

  const disabled = await setCodexMcpServerEnabled('real', false, { home });
  assert.equal(disabled.ok, true);
  const after = await fs.readFile(configPath, 'utf8');
  assert.equal(after, original.replace('enabled = true # keep this comment', 'enabled = false # keep this comment'));
  const parsed = parseCodexConfigToml(after);
  assert.equal(parsed.mcp_servers?.real?.enabled, false);
  assert.equal(parsed.mcp_servers?.other?.env?.CERT, 'line1\n\n\n[mcp_servers.fake]\nline2');
});

test('guarded MCP commits reject an external config change instead of overwriting it', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-external-write-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const before = '[mcp_servers.before]\ncommand = "node"\n';
  const external = '[mcp_servers.external]\ncommand = "node"\n';
  await fs.writeFile(configPath, external, { mode: 0o600 });

  const result = await writeCodexConfigGuarded({
    root: home,
    configPath,
    before,
    ownershipVerified: true,
    verifyUnchangedBeforeWrite: true,
    expectedBeforeExists: true,
    mutate: () => '[mcp_servers.manager]\ncommand = "node"\n'
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'concurrent_change_detected');
  assert.equal(await fs.readFile(configPath, 'utf8'), external);
  assert.equal((await fs.readdir(path.dirname(configPath))).some((entry) => entry.includes('.sks-commit-')), false);
});

test('guarded MCP commits restore the original config when candidate installation fails', { concurrency: false }, async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-install-failure-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const original = '[mcp_servers.before]\ncommand = "node"\n';
  await fs.writeFile(configPath, original, { mode: 0o644 });

  const realLink = fs.link;
  fs.link = async (existingPath, newPath) => {
    if (String(existingPath).includes('.sks-commit-') && path.resolve(String(newPath)) === path.resolve(configPath)) {
      const error = new Error('simulated candidate install failure') as NodeJS.ErrnoException;
      error.code = 'EIO';
      throw error;
    }
    return realLink(existingPath, newPath);
  };
  t.after(() => { fs.link = realLink; });

  const result = await writeCodexConfigGuarded({
    root: home,
    configPath,
    before: original,
    ownershipVerified: true,
    verifyUnchangedBeforeWrite: true,
    expectedBeforeExists: true,
    preserveFastUiKeys: false,
    preserveTextFormatting: true,
    mutate: () => '[mcp_servers.manager]\ncommand = "node"\n'
  });

  fs.link = realLink;
  assert.equal(result.ok, false);
  assert.equal(result.status, 'concurrent_change_detected');
  assert.equal(await fs.readFile(configPath, 'utf8'), original);
  assert.equal((await fs.stat(configPath)).mode & 0o777, 0o600);
  assert.ok(result.backup_path);
  assert.equal((await fs.stat(String(result.backup_path))).mode & 0o777, 0o600);
  assert.equal((await fs.readdir(path.dirname(configPath))).some((entry) => entry.includes('.sks-commit-')), false);
});

test('menu bar MCP commits preserve an external write that arrives after the SKS backup claim', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-backup-race-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, '[mcp_servers.before]\ncommand = "node"\n', { mode: 0o600 });

  for (let index = 0; index < 512; index += 1) {
    await fs.writeFile(`${configPath}.sks-menubar-mcp-add-old-${index}.bak`, 'old\n', { mode: 0o600 });
  }
  const known = new Set(await fs.readdir(path.dirname(configPath)));
  const external = '[mcp_servers.external]\ncommand = "node"\n';
  let externalWriteObserved = false;
  const watcher = (async () => {
    for (let attempt = 0; attempt < 5_000; attempt += 1) {
      const entries = await fs.readdir(path.dirname(configPath));
      if (entries.some((entry) => !known.has(entry) && entry.startsWith('config.toml.sks-menubar-mcp-add-') && entry.endsWith('.bak'))) {
        await fs.writeFile(configPath, external, { mode: 0o600 });
        externalWriteObserved = true;
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  })();

  const result = await addCodexMcpServer({
    name: 'manager',
    transport: 'stdio',
    command: 'node'
  }, { home });
  await watcher;

  assert.equal(externalWriteObserved, true);
  assert.equal(result.ok, true);
  const parsed = parseCodexConfigToml(await fs.readFile(configPath, 'utf8'));
  assert.equal(parsed.mcp_servers?.external?.command, 'node');
  assert.equal(parsed.mcp_servers?.manager?.command, 'node');
  const ownedBackups = (await fs.readdir(path.dirname(configPath)))
    .filter((entry) => entry.startsWith('config.toml.sks-menubar-mcp-add-') && entry.endsWith('.bak'));
  assert.ok(ownedBackups.length > 0 && ownedBackups.length <= 3);
  for (const backup of ownedBackups) {
    assert.equal((await fs.stat(path.join(path.dirname(configPath), backup))).mode & 0o777, 0o600);
  }
  assert.equal((await fs.readdir(path.dirname(configPath))).some((entry) => entry.includes('.sks-commit-')), false);
});

test('menu bar MCP mutations never prune user-created manual backups', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-manual-backups-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, 'service_tier = "fast"\n', { mode: 0o600 });
  const manualBackups = Array.from({ length: 5 }, (_, index) => `${configPath}.manual-${index}.bak`);
  for (const [index, backupPath] of manualBackups.entries()) {
    await fs.writeFile(backupPath, `manual-${index}\n`, { mode: 0o600 });
  }

  const result = await addCodexMcpServer({
    name: 'manual-backup-check',
    transport: 'stdio',
    command: 'node'
  }, { home });

  assert.equal(result.ok, true);
  for (const [index, backupPath] of manualBackups.entries()) {
    assert.equal(await fs.readFile(backupPath, 'utf8'), `manual-${index}\n`);
  }
});

test('menu bar MCP mutations preserve CRLF layout and comments owned by the following table', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-layout-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const original = [
    '[mcp_servers.remove_me]',
    'command = "node"',
    'enabled = true',
    '',
    '# This comment documents the following features table.',
    '[features]',
    'fast_mode = true',
    ''
  ].join('\r\n');
  await fs.writeFile(configPath, original, { mode: 0o600 });

  const disabled = await setCodexMcpServerEnabled('remove_me', false, { home });
  assert.equal(disabled.ok, true);
  const afterDisable = await fs.readFile(configPath, 'utf8');
  assert.equal(afterDisable, original.replace('enabled = true', 'enabled = false'));

  const removed = await removeCodexMcpServer('remove_me', { home });
  assert.equal(removed.ok, true);
  const afterRemove = await fs.readFile(configPath, 'utf8');
  assert.equal(afterRemove, [
    '',
    '# This comment documents the following features table.',
    '[features]',
    'fast_mode = true',
    ''
  ].join('\r\n'));
});

test('menu bar MCP mutations preserve following TOML array tables and their enabled keys', async (t) => {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-menubar-mcp-array-boundary-'));
  t.after(async () => fs.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  const original = [
    '[mcp_servers.demo]',
    'command = "node"',
    '',
    '[[rules]]',
    'name = "must-survive"',
    'enabled = true',
    ''
  ].join('\n');
  await fs.writeFile(configPath, original, { mode: 0o600 });

  const disabled = await setCodexMcpServerEnabled('demo', false, { home });
  assert.equal(disabled.ok, true);
  const afterDisable = await fs.readFile(configPath, 'utf8');
  const parsedDisabled = parseCodexConfigToml(afterDisable);
  assert.equal(parsedDisabled.mcp_servers?.demo?.enabled, false);
  assert.equal(parsedDisabled.rules?.[0]?.enabled, true);
  assert.equal(parsedDisabled.rules?.[0]?.name, 'must-survive');

  const removed = await removeCodexMcpServer('demo', { home });
  assert.equal(removed.ok, true);
  const afterRemove = await fs.readFile(configPath, 'utf8');
  const parsedRemoved = parseCodexConfigToml(afterRemove);
  assert.equal(parsedRemoved.mcp_servers?.demo, undefined);
  assert.equal(parsedRemoved.rules?.[0]?.enabled, true);
  assert.equal(parsedRemoved.rules?.[0]?.name, 'must-survive');
  assert.match(afterRemove, /\[\[rules\]\]/);
});

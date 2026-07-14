import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { CodexCliMutationOperation, CodexMcpCliPort } from '../../mcp-config/codex-cli-adapter.js';
import { removeMcpServerText } from '../../mcp-config/guarded-patch.js';
import {
  addCodexMcpServer,
  codexMcpConfigPath,
  listCodexMcpServers,
  removeCodexMcpServer,
  setCodexMcpServerEnabled
} from '../mcp-manager.js';

class CompatibilityCli implements CodexMcpCliPort {
  async list() { return { available: true, ok: true, rows: [], public_error: null }; }
  async transform(before: string, operation: CodexCliMutationOperation) {
    return {
      available: true,
      ok: true,
      used: true,
      text: operation.action === 'remove' ? removeMcpServerText(before, operation.name) || '' : before,
      unsupported_reason: null,
      public_error: null
    };
  }
  async login() { return { available: true, ok: true, public_error: null }; }
  async logout() { return { available: true, ok: true, public_error: null }; }
}

test('menubar compatibility facade uses MCP v2 and never exposes configured secrets', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-compat-list-'));
  t.after(async () => fsp.rm(home, { recursive: true, force: true }));
  const configPath = codexMcpConfigPath(home);
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  await fsp.writeFile(configPath, [
    '[mcp_servers.context7]',
    'command = "/secret/bin/node"',
    'args = ["--token", "argument-secret"]',
    'env = { CONTEXT7_TOKEN = "inline-secret" }',
    'enabled = false',
    '',
    '[mcp_servers.remote]',
    'url = "https://user:pass@example.test/private/path?token=query-secret"',
    'bearer_token_env_var = "REMOTE_TOKEN"',
    ''
  ].join('\n'), { mode: 0o600 });

  const listed = await listCodexMcpServers({ home, cli: new CompatibilityCli() });
  assert.equal(listed.ok, true);
  assert.equal(listed.server_count, 2);
  assert.equal(listed.servers[0]?.startup_timeout_sec, 10);
  assert.equal(listed.servers[0]?.tool_timeout_sec, 60);
  const serialized = JSON.stringify(listed);
  assert.doesNotMatch(serialized, /argument-secret|inline-secret|query-secret|private\/path|user:pass/);
  assert.match(serialized, /legacy_inline_secret_present|CONTEXT7_TOKEN/);
});

test('menubar compatibility facade adds, toggles, and removes through the official CLI path', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-compat-mutate-'));
  t.after(async () => fsp.rm(home, { recursive: true, force: true }));
  const cli = new CompatibilityCli();
  const added = await addCodexMcpServer({
    name: 'docs_remote',
    transport: 'url',
    url: 'https://mcp.example.test/service',
    bearer_token_env_var: 'DOCS_TOKEN'
  }, { home, cli });
  assert.equal(added.ok, true);
  assert.equal(added.official_cli_used, true);
  const disabled = await setCodexMcpServerEnabled('docs_remote', false, { home, cli });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.enabled, false);
  const removed = await removeCodexMcpServer('docs_remote', { home, cli });
  assert.equal(removed.ok, true);
  assert.equal((await listCodexMcpServers({ home, cli })).server_count, 0);
});

test('menubar compatibility facade rejects legacy raw KEY=VALUE input', async (t) => {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-compat-secret-'));
  t.after(async () => fsp.rm(home, { recursive: true, force: true }));
  const result = await addCodexMcpServer({
    name: 'unsafe', transport: 'stdio', command: 'node', env: { TOKEN: 'must-not-write' }
  }, { home, cli: new CompatibilityCli() });
  assert.equal(result.ok, false);
  assert.deepEqual(result.blockers, ['mcp_raw_secret_storage_forbidden']);
  await assert.rejects(fsp.readFile(codexMcpConfigPath(home), 'utf8'));
});

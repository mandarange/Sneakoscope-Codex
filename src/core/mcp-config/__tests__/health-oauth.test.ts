import test from 'node:test';
import assert from 'node:assert/strict';
import fsp from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { buildCodexMcpAddArgs, type CodexCliMutationOperation, type CodexMcpCliPort } from '../codex-cli-adapter.js';
import { testMcpConnection } from '../health-check.js';
import { loginMcpServer, logoutMcpServer } from '../oauth.js';

class AuthCli implements CodexMcpCliPort {
  calls: Array<{ action: string; name: string; scopes?: readonly string[] }> = [];
  async list() { return { available: true, ok: true, rows: [], public_error: null }; }
  async transform(before: string, _operation: CodexCliMutationOperation) {
    return { available: true, ok: true, used: true, text: before, unsupported_reason: null, public_error: null };
  }
  async login(_ref: unknown, name: string, scopes?: readonly string[]) {
    this.calls.push({ action: 'login', name, ...(scopes ? { scopes } : {}) });
    return { available: true, ok: true, public_error: null };
  }
  async logout(_ref: unknown, name: string) {
    this.calls.push({ action: 'logout', name });
    return { available: true, ok: true, public_error: null };
  }
}

async function fixture(t: test.TestContext) {
  const home = await fsp.mkdtemp(path.join(os.tmpdir(), 'sks-mcp-health-'));
  const configPath = path.join(home, '.codex', 'config.toml');
  await fsp.mkdir(path.dirname(configPath), { recursive: true });
  t.after(async () => fsp.rm(home, { recursive: true, force: true }));
  return { home, configPath };
}

test('stdio health performs initialize and tools/list with bounded secret-safe output', async (t) => {
  const s = await fixture(t);
  const server = path.join(s.home, 'fixture-server.mjs');
  await fsp.writeFile(server, [
    "import readline from 'node:readline';",
    "const rl = readline.createInterface({ input: process.stdin });",
    "rl.on('line', (line) => {",
    "  const msg = JSON.parse(line);",
    "  if (msg.method === 'initialize') console.log(JSON.stringify({ jsonrpc:'2.0', id:msg.id, result:{ protocolVersion:'2024-11-05', instructions:'safe' } }));",
    "  if (msg.method === 'tools/list') console.log(JSON.stringify({ jsonrpc:'2.0', id:msg.id, result:{ tools:[{name:'one'},{name:'two'}] } }));",
    "});"
  ].join('\n'), { mode: 0o600 });
  await fsp.writeFile(s.configPath, [
    '[mcp_servers.local_health]',
    `command = ${JSON.stringify(process.execPath)}`,
    `args = [${JSON.stringify(server)}]`,
    'env_vars = ["MCP_HEALTH_SECRET"]',
    'startup_timeout_sec = 3',
    'tool_timeout_sec = 3',
    ''
  ].join('\n'), { mode: 0o600 });
  const before = process.env.MCP_HEALTH_SECRET;
  process.env.MCP_HEALTH_SECRET = 'must-never-appear';
  t.after(() => {
    if (before === undefined) delete process.env.MCP_HEALTH_SECRET;
    else process.env.MCP_HEALTH_SECRET = before;
  });

  const health = await testMcpConnection('local_health', 'global', { home: s.home });
  assert.equal(health.status, 'healthy');
  assert.equal(health.protocol_version, '2024-11-05');
  assert.equal(health.tool_count, 2);
  assert.equal(health.instructions_present, true);
  assert.doesNotMatch(JSON.stringify(health), /must-never-appear/);
});

test('streamable HTTP health initializes, lists tools, preserves session ID, and reports OAuth required', async (t) => {
  const s = await fixture(t);
  const sessionHeaders: string[] = [];
  const server = http.createServer(async (request, response) => {
    const body = await readRequest(request);
    if (request.url === '/auth') {
      response.writeHead(401, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: 'token-secret-must-not-leak' }));
      return;
    }
    const parsed = JSON.parse(body) as { method?: string; id?: number };
    if (parsed.method === 'initialize') {
      response.writeHead(200, { 'content-type': 'application/json', 'mcp-session-id': 'session-1' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { protocolVersion: '2024-11-05' } }));
      return;
    }
    if (request.headers['mcp-session-id']) sessionHeaders.push(String(request.headers['mcp-session-id']));
    if (parsed.method === 'tools/list') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ jsonrpc: '2.0', id: parsed.id, result: { tools: [{ name: 'one' }] } }));
      return;
    }
    response.writeHead(202); response.end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  await fsp.writeFile(s.configPath, [
    '[mcp_servers.http_health]', `url = "${base}/mcp"`, '',
    '[mcp_servers.http_auth]', `url = "${base}/auth"`, ''
  ].join('\n'), { mode: 0o600 });

  const healthy = await testMcpConnection('http_health', 'global', { home: s.home });
  assert.equal(healthy.status, 'healthy');
  assert.equal(healthy.tool_count, 1);
  assert.ok(sessionHeaders.includes('session-1'));
  const auth = await testMcpConnection('http_auth', 'global', { home: s.home });
  assert.equal(auth.status, 'oauth_required');
  assert.doesNotMatch(JSON.stringify(auth), /token-secret/);
});

test('health runner allows at most two concurrent handshakes', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.configPath, [
    '[mcp_servers.a]', 'url = "https://example.test/a"', '',
    '[mcp_servers.b]', 'url = "https://example.test/b"', '',
    '[mcp_servers.c]', 'url = "https://example.test/c"', ''
  ].join('\n'), { mode: 0o600 });
  let active = 0;
  let peak = 0;
  const fetchImpl: typeof fetch = async (_input, init) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, 20));
    active -= 1;
    const message = JSON.parse(String(init?.body || '{}')) as { method?: string; id?: number };
    const body = message.method === 'initialize'
      ? { jsonrpc: '2.0', id: message.id, result: { protocolVersion: '2024-11-05' } }
      : message.method === 'tools/list'
        ? { jsonrpc: '2.0', id: message.id, result: { tools: [] } }
        : null;
    return new Response(body ? JSON.stringify(body) : '', { status: body ? 200 : 202, headers: { 'content-type': 'application/json' } });
  };
  const results = await Promise.all(['a', 'b', 'c'].map((name) => testMcpConnection(name, 'global', {
    home: s.home,
    dependencies: { fetchImpl }
  })));
  assert.ok(results.every((entry) => entry.status === 'healthy'));
  assert.equal(peak, 2);
});

test('OAuth login/logout use the exact scoped official CLI adapter', async (t) => {
  const s = await fixture(t);
  await fsp.writeFile(s.configPath, '[mcp_servers.remote]\nurl = "https://example.test/mcp"\n', { mode: 0o600 });
  const cli = new AuthCli();
  const login = await loginMcpServer('remote', 'global', { home: s.home, cli }, ['tools.read']);
  assert.equal(login.ok, true);
  assert.equal(login.authenticated, true);
  const logout = await logoutMcpServer('remote', 'global', { home: s.home, cli });
  assert.equal(logout.ok, true);
  assert.deepEqual(cli.calls, [
    { action: 'login', name: 'remote', scopes: ['tools.read'] },
    { action: 'logout', name: 'remote' }
  ]);
});

test('official Codex add argv uses URL/bearer/OAuth references and never raw env values', () => {
  assert.deepEqual(buildCodexMcpAddArgs({
    name: 'remote', transport: 'streamable-http', url: 'https://example.test/mcp',
    bearer_token_env_var: 'MCP_TOKEN', oauth_client_id: 'client', oauth_resource: 'resource'
  }), [
    'mcp', 'add', 'remote', '--url', 'https://example.test/mcp',
    '--bearer-token-env-var', 'MCP_TOKEN', '--oauth-client-id', 'client', '--oauth-resource', 'resource'
  ]);
  assert.deepEqual(buildCodexMcpAddArgs({ name: 'local', transport: 'stdio', command: 'node', args: ['server.js'], env_vars: ['MCP_TOKEN'] }), [
    'mcp', 'add', 'local', '--', 'node', 'server.js'
  ]);
  assert.equal(buildCodexMcpAddArgs({ name: 'dots.not.allowed', transport: 'stdio', command: 'node' }), null);
});

async function readRequest(request: http.IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import type { ProviderSessionPin } from '../../bridge-contracts.js';
import {
  desktopBridgeClientPath,
  startDesktopBridge,
  type DesktopBridgeConfig,
  type DesktopBridgeOpenRouterOnlyConfig,
} from '../index.js';

const CAPABILITY = Buffer.alloc(32, 0x6f).toString('base64url');
const SESSION = '019fd56f-d48f-7942-a560-48ad9ef47223';
const CHILD = '019fd570-1111-7942-a560-48ad9ef47999';
const LISTED = 'vendor/listed';
const UNLISTED = 'vendor/unlisted';
const MODE: DesktopBridgeOpenRouterOnlyConfig = { enabled: true, subagent_models: [LISTED] };

const ROOT_HEADERS = {
  'thread-id': SESSION, 'session-id': SESSION,
  'x-codex-turn-metadata': JSON.stringify({ session_id: SESSION, thread_id: SESSION, thread_source: 'user' }),
};
const CHILD_HEADERS = {
  'thread-id': CHILD, 'session-id': SESSION,
  'x-codex-turn-metadata': JSON.stringify({
    session_id: SESSION, thread_id: CHILD, parent_thread_id: SESSION, subagent_kind: 'thread_spawn', thread_source: 'subagent',
  }),
};

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}
async function freePort(): Promise<number> {
  const server = net.createServer(); const port = await listen(server);
  await new Promise<void>((resolve) => server.close(() => resolve())); return port;
}

/** Records every HTTP request and echoes every WebSocket message. */
function upstream(t: TestContext) {
  const requests: Array<{ path: string; model: unknown }> = [];
  const upgrades: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let model: unknown = null;
      try { model = JSON.parse(Buffer.concat(chunks).toString('utf8')).model ?? null; } catch { /* not JSON */ }
      requests.push({ path: String(req.url), model });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<net.Socket>();
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    upgrades.push(String(req.url));
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => undefined);
      ws.on('message', (data, binary) => ws.send(data, { binary }));
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { server, requests, upgrades };
}

const LB_PIN: ProviderSessionPin = {
  thread_id: SESSION, provider_id: 'codex-lb', public_model: 'gpt-lb', upstream_model: 'gpt-lb',
  catalog_generation: 'catalog', route_policy_generation: 'policy', created_at: '2026-09-27T00:00:00.000Z',
};

async function fixture(t: TestContext, mode: DesktopBridgeOpenRouterOnlyConfig | null, pins: ProviderSessionPin[] = []) {
  const lb = upstream(t); const openrouter = upstream(t); const official = upstream(t);
  const lbBase = `http://127.0.0.1:${await listen(lb.server)}/backend-api/codex`;
  const orBase = `http://127.0.0.1:${await listen(openrouter.server)}/api/v1`;
  const officialBase = `http://127.0.0.1:${await listen(official.server)}/backend-api/codex`;
  const port = await freePort();
  const persisted: ProviderSessionPin[][] = [];
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: {
      schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-09-27T00:00:00.000Z',
      providers: {
        'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'x-codex-lb-api-key', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
        openrouter: { provider_id: 'openrouter', enabled: true, base_url: orBase, allowed_origins: [new URL(orBase).origin], auth_transport: 'openrouter-bearer', credential_state: 'ready', credential_fingerprint: 'or-fp', credential_generation: 'or-credential', source_catalog_generation: 'or-catalog' },
      },
    },
    routePolicy: {
      schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'openrouter', fallback: 'none',
      model_routes: {
        'gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb' },
        [LISTED]: { provider_id: 'openrouter', upstream_model: LISTED },
        [UNLISTED]: { provider_id: 'openrouter', upstream_model: UNLISTED },
        'official-model': { provider_id: 'openai', upstream_model: 'official-model' },
      },
      catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-09-27T00:00:00.000Z',
    },
    providerSessionPins: pins,
    persistProviderSessionPins: async (pins) => { persisted.push([...pins]); },
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: `${providerId}-secret`, source: 'test', fingerprint: providerId === 'codex-lb' ? 'lb-fp' : 'or-fp' }),
    clientCapabilitySha256: createHash('sha256').update(CAPABILITY).digest('hex'),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 1_000, idleTimeoutMs: 5_000,
    officialPassthrough: { baseUrl: officialBase },
    ...(mode ? { openRouterOnly: mode } : {}),
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());

  async function post(path: string, body: unknown, headers: Record<string, string> = ROOT_HEADERS): Promise<{ status: number; code: string | null }> {
    const payload = Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port, method: 'POST', path: desktopBridgeClientPath(CAPABILITY, path),
        headers: { 'content-type': 'application/json', 'content-length': String(payload.length), origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          let code: string | null = null;
          try { code = JSON.parse(Buffer.concat(chunks).toString('utf8')).error?.code ?? null; } catch { /* upstream body */ }
          resolve({ status: response.statusCode || 0, code });
        });
      });
      request.once('error', reject);
      request.end(payload);
    });
  }
  async function responsesSocket(headers: Record<string, string>) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses')}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers } });
    ws.on('error', () => undefined); t.after(() => ws.terminate());
    await once(ws, 'open'); return ws;
  }
  /** An accepted non-Responses upgrade. */
  async function nativeSocket(headers: Record<string, string>) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/native-tunnel')}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers } });
    ws.on('error', () => undefined); t.after(() => ws.terminate());
    await once(ws, 'open'); return ws;
  }
  /** A raw non-Responses upgrade; resolves with the refusal status line and body. */
  async function nativeUpgrade(headers: Record<string, string>): Promise<{ status: number; body: Record<string, any> }> {
    const socket = net.connect({ host: '127.0.0.1', port });
    t.after(() => socket.destroy());
    await once(socket, 'connect');
    const lines = [
      `GET ${desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/native-tunnel')} HTTP/1.1`, `Host: 127.0.0.1:${port}`,
      'Connection: Upgrade', 'Upgrade: websocket', 'Sec-WebSocket-Version: 13', `Sec-WebSocket-Key: ${Buffer.alloc(16, 7).toString('base64')}`,
      'Origin: app://codex', ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`),
    ];
    socket.write(`${lines.join('\r\n')}\r\n\r\n`);
    const chunks: Buffer[] = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    await once(socket, 'close');
    const text = Buffer.concat(chunks).toString('utf8');
    return { status: Number(text.match(/^HTTP\/1\.1 (\d{3})/)?.[1] ?? 0), body: JSON.parse(text.slice(text.indexOf('\r\n\r\n') + 4)) };
  }
  return { lb, openrouter, official, persisted, post, responsesSocket, nativeSocket, nativeUpgrade };
}

async function exchange(ws: WebSocket, value: unknown): Promise<Record<string, any>> {
  const reply = once(ws, 'message'); ws.send(JSON.stringify(value));
  return JSON.parse(String((await reply)[0]));
}

test('HTTP: mode on refuses non-OpenRouter routes with 409 and keeps model-less passthrough', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: UNLISTED, input: 'hi' }), { status: 200, code: null });
  assert.deepEqual(f.openrouter.requests, [{ path: '/api/v1/responses', model: UNLISTED }]);
  for (const model of ['gpt-lb', 'official-model', 'unknown-model']) {
    assert.deepEqual(await f.post('/backend-api/codex/responses', { model, input: 'hi' }), { status: 409, code: 'openrouter_only_route_blocked' }, model);
  }
  assert.equal(f.lb.requests.length, 0);
  assert.equal(f.official.requests.length, 0);
  // Native endpoints without a model still reach the official upstream.
  assert.deepEqual(await f.post('/backend-api/codex/alpha/search', { query: 'q' }), { status: 200, code: null });
  assert.deepEqual(f.official.requests, [{ path: '/backend-api/codex/alpha/search', model: null }]);
});

test('HTTP: mode on holds spawned children to the subagent list', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: UNLISTED, input: 'hi' }, CHILD_HEADERS), { status: 409, code: 'openrouter_only_subagent_model_blocked' });
  assert.equal(f.persisted.length, 0, 'a refused child leaves no pin behind');
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: LISTED, input: 'hi' }, CHILD_HEADERS), { status: 200, code: null });
  assert.deepEqual(f.persisted.at(-1)?.map((pin) => [pin.thread_id, pin.provider_id, pin.public_model]), [[CHILD, 'openrouter', LISTED]]);
  // Same thread/session mismatch, no lineage: not a child, so the list does not apply.
  const bare = { 'thread-id': CHILD, 'session-id': SESSION };
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: UNLISTED, input: 'hi' }, bare), { status: 200, code: null });
  assert.deepEqual(f.openrouter.requests.map((row) => row.model), [LISTED, UNLISTED]);
});

test('HTTP: mode off routes Codex-LB, official and unlisted child models as before', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, null);
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: 'gpt-lb', input: 'hi' }), { status: 200, code: null });
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: 'official-model', input: 'hi' }), { status: 200, code: null });
  assert.deepEqual(await f.post('/backend-api/codex/responses', { model: UNLISTED, input: 'hi' }, CHILD_HEADERS), { status: 200, code: null });
  assert.equal(f.lb.requests.length, 1);
  assert.equal(f.official.requests.length, 1);
  assert.equal(f.openrouter.requests.length, 1);
});

test('Responses WebSocket: mode on refuses Codex-LB creates and unlisted child creates before dialing', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  const root = await f.responsesSocket(ROOT_HEADERS);
  assert.equal((await exchange(root, { type: 'response.create', model: 'gpt-lb', input: 'hi' })).error?.code, 'openrouter_only_route_blocked');
  // Lineage carried only inside the create's client_metadata still marks a child.
  const child = await f.responsesSocket({ 'thread-id': CHILD });
  const refused = await exchange(child, {
    type: 'response.create', model: UNLISTED, input: 'hi',
    client_metadata: { thread_id: CHILD, 'x-codex-turn-metadata': JSON.stringify({ thread_id: CHILD, parent_thread_id: SESSION, subagent_kind: 'thread_spawn' }) },
  });
  assert.equal(refused.error?.code, 'openrouter_only_subagent_model_blocked');
  assert.deepEqual(f.lb.upgrades, []);
  assert.deepEqual(f.openrouter.upgrades, []);
  assert.equal(f.persisted.length, 0);

  const listed = await f.responsesSocket(CHILD_HEADERS);
  assert.deepEqual(await exchange(listed, { type: 'response.create', model: LISTED, input: 'hi' }), { type: 'response.create', model: LISTED, input: 'hi' });
  assert.deepEqual(f.openrouter.upgrades, ['/api/v1/responses']);
});

test('HTTP: mode on holds Responses sub-endpoints such as compact to the same route check', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  const compact = '/backend-api/codex/responses/compact';
  for (const model of ['gpt-lb', 'official-model', 'unknown-model']) {
    assert.deepEqual(await f.post(compact, { model, input: [] }), { status: 409, code: 'openrouter_only_route_blocked' }, model);
  }
  assert.deepEqual(await f.post('/backend-api/codex/responses/guardian/guardian-classifier', { model: 'gpt-lb', input: [] }), { status: 409, code: 'openrouter_only_route_blocked' });
  const childHeaders = { ...CHILD_HEADERS, 'x-openai-subagent': 'collab_spawn' };
  assert.deepEqual(await f.post(compact, { model: UNLISTED, input: [] }, childHeaders), { status: 409, code: 'openrouter_only_subagent_model_blocked' });
  assert.deepEqual(f.official.requests, []);
  assert.deepEqual(f.lb.requests, []);
  // An OpenRouter thread compacts on OpenRouter, never on the official identity.
  assert.deepEqual(await f.post(compact, { model: LISTED, input: [] }, childHeaders), { status: 200, code: null });
  assert.deepEqual(f.openrouter.requests, [{ path: '/api/v1/responses/compact', model: LISTED }]);
  // A sub-endpoint body without a model stays on the model-less passthrough, untouched.
  assert.deepEqual(await f.post('/backend-api/codex/responses/resp_1/cancel', { reason: 'user' }), { status: 200, code: null });
  assert.deepEqual(f.official.requests, [{ path: '/backend-api/codex/responses/resp_1/cancel', model: null }]);
});

test('HTTP: mode off keeps Responses sub-endpoints on the model-less passthrough', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, null);
  assert.deepEqual(await f.post('/backend-api/codex/responses/compact', { model: 'gpt-lb', input: [] }, CHILD_HEADERS), { status: 200, code: null });
  assert.deepEqual(f.official.requests, [{ path: '/backend-api/codex/responses/compact', model: 'gpt-lb' }]);
  assert.equal(f.lb.requests.length + f.openrouter.requests.length, 0);
});

test('Responses WebSocket: header-named lineage inside client_metadata marks a child', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  const ws = await f.responsesSocket({ 'thread-id': CHILD, 'session-id': SESSION });
  const refused = await exchange(ws, {
    type: 'response.create', model: UNLISTED, input: 'hi',
    client_metadata: { 'x-codex-parent-thread-id': SESSION, 'x-openai-subagent': 'collab_spawn' },
  });
  assert.equal(refused.error?.code, 'openrouter_only_subagent_model_blocked');
  assert.deepEqual(f.openrouter.upgrades, []);
});

test('Responses WebSocket: lineage accumulates, so a bound root socket turned child obeys the list', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  const ws = await f.responsesSocket({ 'thread-id': CHILD });
  const first = { type: 'response.create', model: UNLISTED, input: 'hi', client_metadata: { thread_id: CHILD } };
  assert.deepEqual(await exchange(ws, first), first);
  const marked = await exchange(ws, { type: 'response.create', model: UNLISTED, input: 'again', client_metadata: { thread_id: CHILD, parent_thread_id: SESSION } });
  assert.equal(marked.error?.code, 'openrouter_only_subagent_model_blocked');
});

test('native WebSocket upgrade: mode refusals are permanent, not retryable', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, MODE);
  const refused = await f.nativeUpgrade({ 'x-sks-model': 'gpt-lb', ...ROOT_HEADERS });
  assert.equal(refused.status, 501);
  assert.deepEqual(refused.body.error, { type: 'sks_bridge_error', code: 'openrouter_only_route_blocked', retryable: false });
  const child = await f.nativeUpgrade({ 'x-sks-model': UNLISTED, ...CHILD_HEADERS });
  assert.equal(child.status, 501);
  assert.equal(child.body.error.code, 'openrouter_only_subagent_model_blocked');
  assert.deepEqual(f.lb.upgrades, []);
  assert.deepEqual(f.openrouter.upgrades, []);
});

test('native WebSocket upgrade: a model-less tunnel on a pre-mode Codex-LB pin keeps the official passthrough', { timeout: 15_000 }, async (t) => {
  const on = await fixture(t, MODE, [LB_PIN]);
  await on.nativeSocket(ROOT_HEADERS);
  assert.deepEqual(on.official.upgrades, ['/backend-api/codex/native-tunnel']);
  assert.deepEqual(on.lb.upgrades, []);
  // Mode off still follows the thread's pin.
  const off = await fixture(t, null, [LB_PIN]);
  await off.nativeSocket(ROOT_HEADERS);
  assert.deepEqual(off.lb.upgrades, ['/backend-api/codex/native-tunnel']);
  assert.deepEqual(off.official.upgrades, []);
});

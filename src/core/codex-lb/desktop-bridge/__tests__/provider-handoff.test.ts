import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http, { type IncomingHttpHeaders } from 'node:http';
import net, { type AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import type { BridgeRoutingPolicy, ProviderSessionPin } from '../../bridge-contracts.js';
import { desktopBridgeClientPath, selectAvailableDesktopBridgePort, startDesktopBridge, type DesktopBridgeConfig } from '../index.js';

// A thread that changes model may change provider. Its history then holds
// items only the previous account can read; the bridge strips them, and
// refuses a move whose history the destination cannot read at all.

const CAPABILITY = Buffer.alloc(32, 0x3c).toString('base64url');
const THREAD = '019fd56f-0000-7942-a560-48ad9ef47223';
const OTHER_THREAD = '019fd56f-1111-7942-a560-48ad9ef47223';
const LISTED = 'vendor/listed';
const ISSUED = 'turn_0123456789abcdef0123456789abcdef';
const headersFor = (thread: string) => ({
  'thread-id': thread, 'session-id': thread,
  'x-codex-turn-metadata': JSON.stringify({ session_id: thread, thread_id: thread, thread_source: 'user' }),
});
const user = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
const assistant = (text: string) => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });
const reasoning = (id: string, encrypted: string) => ({ type: 'reasoning', id, summary: [{ type: 'summary_text', text: 'thinking' }], encrypted_content: encrypted });
const NATIVE_ITEM = { type: 'compaction', id: 'cmp_native_1', encrypted_content: 'gAAAAABnative-opaque-account-bound' };

interface Recorded { path: string; body: any; headers: IncomingHttpHeaders }

function upstream(t: TestContext, responseHeaders: Record<string, string> = {}) {
  const requests: Recorded[] = [];
  const socketMessages: any[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body: any = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
      requests.push({ path: String(req.url), body, headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json', ...responseHeaders });
      res.end('{"ok":true}');
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<net.Socket>();
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => undefined);
      ws.on('message', (data) => { socketMessages.push(JSON.parse(String(data))); ws.send(data); });
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { server, requests, socketMessages };
}

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function fixture(t: TestContext, options: { routes?: BridgeRoutingPolicy['model_routes']; pins?: ProviderSessionPin[]; lbHeaders?: Record<string, string> } = {}) {
  const lb = upstream(t, options.lbHeaders); const openrouter = upstream(t); const official = upstream(t);
  const lbBase = `http://127.0.0.1:${await listen(lb.server)}/backend-api/codex`;
  const orBase = `http://127.0.0.1:${await listen(openrouter.server)}/api/v1`;
  const officialBase = `http://127.0.0.1:${await listen(official.server)}/backend-api/codex`;
  const port = await selectAvailableDesktopBridgePort('127.0.0.1');
  const persisted: ProviderSessionPin[][] = [];
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: {
      schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-10-22T00:00:00.000Z',
      providers: {
        'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'authorization-bearer', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
        openrouter: { provider_id: 'openrouter', enabled: true, base_url: orBase, allowed_origins: [new URL(orBase).origin], auth_transport: 'openrouter-bearer', credential_state: 'ready', credential_fingerprint: 'or-fp', credential_generation: 'or-credential', source_catalog_generation: 'or-catalog' },
      },
    },
    routePolicy: {
      schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'codex-lb', fallback: 'none',
      model_routes: options.routes ?? {
        'gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb' },
        [LISTED]: { provider_id: 'openrouter', upstream_model: LISTED },
      },
      catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-10-22T00:00:00.000Z',
    },
    providerSessionPins: options.pins ?? [],
    persistProviderSessionPins: async (pins) => { persisted.push(structuredClone([...pins])); },
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: `${providerId}-secret`, source: 'test', fingerprint: providerId === 'codex-lb' ? 'lb-fp' : 'or-fp' }),
    clientCapabilitySha256: createHash('sha256').update(CAPABILITY).digest('hex'),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 1_000, idleTimeoutMs: 5_000,
    officialPassthrough: { baseUrl: officialBase },
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());

  async function post(body: unknown, headers: Record<string, string> = headersFor(THREAD)): Promise<{ status: number; body: any }> {
    const payload = Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port, method: 'POST', path: desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses'),
        headers: { 'content-type': 'application/json', 'content-length': String(payload.length), origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode || 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null') }));
      });
      request.once('error', reject);
      request.end(payload);
    });
  }
  async function socket(headers: Record<string, string> = headersFor(THREAD)) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses')}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers } });
    ws.on('error', () => undefined);
    t.after(() => ws.terminate());
    await once(ws, 'open');
    return ws;
  }
  const pinOf = (thread: string) => persisted.at(-1)?.find((pin) => pin.thread_id === thread);
  return { lb, openrouter, official, post, socket, persisted, pinOf };
}

const carriesEncrypted = (body: any) => JSON.stringify(body).includes('encrypted_content');

test('HTTP: a thread moving Codex-LB → OpenRouter → Codex-LB never carries account-bound items across', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const history = [user('fix the parser'), reasoning('rs_lb_1', 'lb-account-encrypted'), assistant('done')];
  assert.equal((await f.post({ model: 'gpt-lb', input: history })).status, 200);
  assert.deepEqual(f.lb.requests[0]!.body.input, history, 'a thread that never moved is forwarded as sent');

  // Codex sends the whole history when the model changes.
  assert.equal((await f.post({ model: LISTED, previous_response_id: 'resp_lb_1', input: [...history, user('now on openrouter')] })).status, 200);
  const moved = f.openrouter.requests[0]!.body;
  assert.deepEqual(moved.input, [user('fix the parser'), assistant('done'), user('now on openrouter')]);
  assert.equal(moved.previous_response_id, undefined);
  assert.deepEqual([f.pinOf(THREAD)?.provider_id, f.pinOf(THREAD)?.handoff_from], ['openrouter', 'codex-lb']);

  // Later turns of a moved thread keep dropping reasoning: nothing tells whose it is.
  assert.equal((await f.post({ model: LISTED, input: [...history, reasoning('rs_or_1', 'or-encrypted'), user('again')] })).status, 200);
  assert.equal(carriesEncrypted(f.openrouter.requests[1]!.body), false);

  assert.equal((await f.post({ model: 'gpt-lb', input: [...history, reasoning('rs_or_1', 'or-encrypted'), user('back on codex-lb')] })).status, 200);
  assert.equal(carriesEncrypted(f.lb.requests[1]!.body), false);
  assert.deepEqual([f.pinOf(THREAD)?.provider_id, f.pinOf(THREAD)?.handoff_from], ['codex-lb', 'openrouter']);
  assert.equal(f.official.requests.length, 0);
});

test('HTTP: a move that would carry a native compaction is refused readably, and the thread stays put', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post({ model: 'gpt-lb', input: [user('hi')] })).status, 200);
  const refused = await f.post({ model: LISTED, input: [user('hi'), NATIVE_ITEM, user('switch')] });
  // Codex maps a 400 `invalid_prompt` to a non-retryable error that shows the message.
  assert.equal(refused.status, 400);
  assert.equal(refused.body.error.code, 'invalid_prompt');
  assert.equal(refused.body.error.param, 'bridge_thread_handoff_after_native_compaction');
  assert.match(refused.body.error.message, /compacted on Codex-LB.*continue on OpenRouter/);
  assert.equal(f.openrouter.requests.length, 0);
  assert.equal(f.pinOf(THREAD)?.provider_id, 'codex-lb', 'the refused move left the pin where it was');

  assert.equal((await f.post({ model: 'gpt-lb', input: [user('hi'), NATIVE_ITEM, user('stay')] })).status, 200);
  assert.deepEqual(f.lb.requests[1]!.body.input[1], NATIVE_ITEM, 'its own provider still reads it');
});

test('Responses WebSocket: a refused move answers invalid_prompt and the socket stays open', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post({ model: 'gpt-lb', input: [user('hi')] })).status, 200);
  const ws = await f.socket();
  const refused = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, input: [user('hi'), NATIVE_ITEM] }));
  const event = JSON.parse(String((await refused)[0]));
  assert.equal(event.type, 'response.failed');
  assert.equal(event.response.error.code, 'invalid_prompt');
  assert.match(event.response.error.message, /compacted on Codex-LB/);
  assert.equal(ws.readyState, WebSocket.OPEN, 'no reconnect, so Codex never falls back to HTTP for it');

  const relayed = once(ws, 'message');
  ws.send(JSON.stringify({ type: 'response.create', model: 'gpt-lb', input: [user('hi'), NATIVE_ITEM] }));
  assert.equal(JSON.parse(String((await relayed)[0])).model, 'gpt-lb');
  assert.equal(f.lb.socketMessages.length, 1);
  assert.equal(f.openrouter.socketMessages.length, 0);
});

test('an official thread stays on the official identity after its bare id moves to Codex-LB', { timeout: 20_000 }, async (t) => {
  const official = await fixture(t, { routes: { 'gpt-x': { provider_id: 'openai', upstream_model: 'gpt-x' } } });
  assert.equal((await official.post({ model: 'gpt-x', input: [user('hi')] })).status, 200);
  const pins = official.persisted.at(-1)!;
  assert.deepEqual(pins.map((pin) => [pin.thread_id, pin.provider_id]), [[THREAD, 'openai']]);

  // Auth priority (or a Codex-LB registration) now sends bare gpt-x to Codex-LB.
  const flipped = await fixture(t, {
    routes: { 'gpt-x': { provider_id: 'codex-lb', upstream_model: 'gpt-x' }, 'codex-lb:gpt-x': { provider_id: 'codex-lb', upstream_model: 'gpt-x' } },
    pins,
  });
  assert.equal((await flipped.post({ model: 'gpt-x', input: [user('again')] })).status, 200);
  assert.equal(flipped.official.requests.length, 1, 'the running thread keeps its identity');
  assert.equal(flipped.official.requests[0]!.headers.authorization, 'Bearer client-oauth');
  assert.equal(flipped.lb.requests.length, 0);
  assert.equal((await flipped.post({ model: 'gpt-x', input: [user('new thread')] }, headersFor(OTHER_THREAD))).status, 200);
  assert.equal(flipped.lb.requests.length, 1, 'a new thread follows the new route');
});

test('Codex-LB receives only the turn-states it issued for the same thread and key', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { lbHeaders: { 'x-codex-turn-state': ISSUED } });
  // A turn-state from the official backend (or before a key change) is not Codex-LB's.
  assert.equal((await f.post({ model: 'gpt-lb', input: [user('hi')] }, { ...headersFor(THREAD), 'x-codex-turn-state': 'turn_official_issued_elsewhere' })).status, 200);
  assert.equal(f.lb.requests[0]!.headers['x-codex-turn-state'], undefined);
  assert.equal((await f.post({ model: 'gpt-lb', input: [user('tool output')] }, { ...headersFor(THREAD), 'x-codex-turn-state': ISSUED })).status, 200);
  assert.equal(f.lb.requests[1]!.headers['x-codex-turn-state'], ISSUED, 'its own turn-state comes back to it');
  assert.equal((await f.post({ model: 'gpt-lb', input: [user('hi')] }, { ...headersFor(OTHER_THREAD), 'x-codex-turn-state': ISSUED })).status, 200);
  assert.equal(f.lb.requests[2]!.headers['x-codex-turn-state'], undefined, 'another thread cannot borrow it');
});

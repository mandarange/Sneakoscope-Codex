import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http, { type IncomingHttpHeaders } from 'node:http';
import net, { type AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import { desktopBridgeClientPath, selectAvailableDesktopBridgePort, startDesktopBridge, type DesktopBridgeConfig } from '../index.js';
import { desktopBridgeModelsEtag, type DesktopBridgeModelsCatalog } from '../models-endpoint.js';

// Codex keeps the `/models` ETag and re-fetches the list whenever a Responses
// reply advertises a different `X-Models-Etag` — on HTTP as a header, on the
// WebSocket inside a `codex.response.metadata` event. The bridge serves its own
// catalog and advertises it in place of whatever the upstream says.

const CAPABILITY = Buffer.alloc(32, 0x4d).toString('base64url');
const MODEL = 'gpt-6-astra';
const OFFICIAL_MODEL = 'gpt-official';
const UPSTREAM_ETAG = 'W/"upstream-official-catalog"';
const catalog = (generation: string): DesktopBridgeModelsCatalog => ({
  generation,
  models: [
    { slug: MODEL, display_name: 'Astra', visibility: 'list', minimal_client_version: '0.153.0', provider_id: 'codex-lb' },
    { slug: 'gpt-next', display_name: 'Next', visibility: 'list', minimal_client_version: '0.170.0', provider_id: 'codex-lb' },
    { slug: 'vendor/model', display_name: 'Vendor', visibility: 'list', minimal_client_version: '', provider_id: 'openrouter' },
  ],
});

function upstream(t: TestContext) {
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'x-models-etag': UPSTREAM_ETAG });
      res.end('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1","output":[]}}\n\n');
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<net.Socket>();
  const upgrades: IncomingHttpHeaders[] = [];
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => {
    upgrades.push(req.headers);
    ws.on('error', () => undefined);
    ws.on('message', () => {
      ws.send(JSON.stringify({ type: 'codex.response.metadata', headers: { 'X-Models-Etag': UPSTREAM_ETAG, 'x-codex-turn-state': 'turn_1' } }));
      ws.send('{"type":"response.completed","response":{"id":"resp_1","output":[]}}');
    });
  }));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { server, upgrades };
}

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function fixture(t: TestContext, modelsCatalog: DesktopBridgeModelsCatalog | null) {
  const lb = upstream(t);
  const official = upstream(t);
  const lbBase = `http://127.0.0.1:${await listen(lb.server)}/backend-api/codex`;
  const officialBase = `http://127.0.0.1:${await listen(official.server)}/backend-api/codex`;
  const port = await selectAvailableDesktopBridgePort('127.0.0.1');
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: { schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-10-28T00:00:00.000Z', providers: {
      'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'x-codex-lb-api-key', credential_state: 'ready', credential_fingerprint: 'fp', credential_generation: 'credential', source_catalog_generation: 'catalog' },
      openrouter: { provider_id: 'openrouter', enabled: false, base_url: 'https://openrouter.ai/api/v1', allowed_origins: ['https://openrouter.ai'], auth_transport: 'openrouter-bearer', credential_state: 'not_configured', credential_fingerprint: null, credential_generation: 'unused', source_catalog_generation: null },
    } },
    routePolicy: { schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'codex-lb', fallback: 'none', model_routes: {
      [MODEL]: { provider_id: 'codex-lb', upstream_model: MODEL },
      [OFFICIAL_MODEL]: { provider_id: 'openai', upstream_model: OFFICIAL_MODEL },
    }, catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-10-28T00:00:00.000Z' },
    providerSessionPins: [],
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: 'lb-secret', source: 'test', fingerprint: 'fp' }),
    clientCapabilitySha256: createHash('sha256').update(CAPABILITY).digest('hex'),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 2_000, idleTimeoutMs: 10_000,
    officialPassthrough: { baseUrl: officialBase },
    ...(modelsCatalog ? { modelsCatalog } : {}),
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());
  const path = (route: string) => desktopBridgeClientPath(CAPABILITY, route);
  async function request(method: string, route: string, headers: Record<string, string> = {}, body?: string) {
    return new Promise<{ status: number; headers: IncomingHttpHeaders; text: string }>((resolve, reject) => {
      const req = http.request({ host: '127.0.0.1', port, method, path: path(route), headers: { origin: 'app://codex', authorization: 'Bearer client-oauth', ...(body ? { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) } : {}), ...headers } }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode || 0, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
      });
      req.once('error', reject);
      req.end(body);
    });
  }
  async function socketFrames(model: string): Promise<{ upgrade: IncomingHttpHeaders; frames: Record<string, any>[] }> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path('/backend-api/codex/responses')}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth' } });
    ws.on('error', () => undefined);
    t.after(() => ws.terminate());
    // 'open' follows 'upgrade' in the same tick: listen for both first.
    const upgraded = once(ws, 'upgrade') as Promise<[http.IncomingMessage]>;
    const opened = once(ws, 'open');
    const [upgrade] = await upgraded;
    await opened;
    const frames: Record<string, any>[] = [];
    const done = new Promise<void>((resolve) => ws.on('message', (data) => {
      frames.push(JSON.parse(String(data)));
      if (frames.length === 2) resolve();
    }));
    ws.send(JSON.stringify({ type: 'response.create', model, input: [] }));
    await done;
    return { upgrade: upgrade.headers, frames };
  }
  return { request, socketFrames, lb, official };
}

const GENERATION = 'a1b2c3d4e5f6a7b8c9d0'.padEnd(64, '0');

test('the bridge answers /models from its catalog, with an ETag Codex can compare', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, catalog(GENERATION));
  const token = desktopBridgeModelsEtag(GENERATION);
  assert.equal(token, 'sksb-a1b2c3d4e5f6a7b8', 'deterministic and unquoted');
  const listed = await f.request('GET', '/backend-api/codex/models?client_version=0.165.0');
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.etag, token);
  assert.equal(listed.headers['cache-control'], 'no-store');
  assert.match(String(listed.headers['content-type']), /^application\/json/);
  assert.deepEqual(JSON.parse(listed.text).models.map((row: any) => row.slug), [MODEL, 'vendor/model'], 'a row needing a newer Codex is left out');
  assert.deepEqual(JSON.parse((await f.request('GET', '/backend-api/codex/models?client_version=0.170.1')).text).models.length, 3);
  const unchanged = await f.request('GET', '/backend-api/codex/models?client_version=0.165.0', { 'if-none-match': token });
  assert.equal(unchanged.status, 304);
  assert.equal(unchanged.text, '');
  assert.equal((await f.request('GET', '/backend-api/codex/models', { 'if-none-match': '"sksb-old"' })).status, 200);
});

test('every Responses reply advertises the bridge catalog in place of the upstream value, on every route', { timeout: 15_000 }, async (t) => {
  const f = await fixture(t, catalog(GENERATION));
  const token = desktopBridgeModelsEtag(GENERATION);
  for (const model of [MODEL, OFFICIAL_MODEL]) {
    const reply = await f.request('POST', '/backend-api/codex/responses', {}, JSON.stringify({ model, input: [] }));
    assert.equal(reply.status, 200, reply.text);
    assert.equal(reply.headers['x-models-etag'], token, `${model}: X-Models-Etag and ETag are the same bytes`);
  }
  for (const model of [MODEL, OFFICIAL_MODEL]) {
    const { upgrade, frames } = await f.socketFrames(model);
    assert.equal(upgrade['x-models-etag'], undefined, 'Codex reads the WebSocket value from the metadata event, not the handshake');
    assert.deepEqual(frames[0], { type: 'codex.response.metadata', headers: { 'x-codex-turn-state': 'turn_1', 'x-models-etag': token } });
    assert.equal(frames[1]!.type, 'response.completed');
  }
});

test('a new catalog generation is a new token; without a catalog /models passes through as before', { timeout: 15_000 }, async (t) => {
  const next = 'ffeeddccbbaa99887766'.padEnd(64, '1');
  const refreshed = await fixture(t, catalog(next));
  assert.equal((await refreshed.request('GET', '/backend-api/codex/models')).headers.etag, desktopBridgeModelsEtag(next));
  assert.notEqual(desktopBridgeModelsEtag(next), desktopBridgeModelsEtag(GENERATION));

  const legacy = await fixture(t, null);
  const reply = await legacy.request('POST', '/backend-api/codex/responses', {}, JSON.stringify({ model: MODEL, input: [] }));
  assert.equal(reply.headers['x-models-etag'], UPSTREAM_ETAG, 'no catalog: headers travel as sent');
  const passthrough = await legacy.request('GET', '/backend-api/codex/models');
  assert.equal(passthrough.status, 200, 'the official backend answered it');
  assert.equal(passthrough.headers.etag, undefined);
});

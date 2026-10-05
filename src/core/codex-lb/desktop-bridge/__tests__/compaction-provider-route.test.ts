import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import WebSocket, { WebSocketServer } from 'ws';
import {
  desktopBridgeClientPath,
  selectAvailableDesktopBridgePort,
  startDesktopBridge,
  type DesktopBridgeConfig,
  type DesktopBridgeOpenRouterOnlyConfig,
} from '../index.js';
import { CODEX_SUMMARIZATION_PROMPT, CODEX_SUMMARY_PREFIX, decodeBridgeCompaction } from '../compaction-adapter.js';

// Codex compacts remotely through the bridge (it believes the bridge is
// OpenAI); a thread routed to Codex-LB or OpenRouter used to fail every
// compaction with bridge_upstream_request_failed.

const CAPABILITY = Buffer.alloc(32, 0x5a).toString('base64url');
const SESSION = '019fd56f-d48f-7942-a560-48ad9ef47223';
const LISTED = 'vendor/listed';
const ROOT_HEADERS = {
  'thread-id': SESSION, 'session-id': SESSION,
  'x-codex-turn-metadata': JSON.stringify({ session_id: SESSION, thread_id: SESSION, thread_source: 'user' }),
};
const SUMMARY = 'Summary: the parser is fixed; next, add the regression test.';
const TOOLS = [{ type: 'function', name: 'shell', parameters: { type: 'object', properties: {} } }];
const user = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });

type Reply = { status: number; body: string; contentType?: string };
interface Recorded { path: string; body: any }

function sse(...events: object[]): string {
  return events.map((event) => `event: ${(event as any).type}\ndata: ${JSON.stringify(event)}\n\n`).join('');
}

function summaryStream(): string {
  const item = { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: SUMMARY }] };
  return sse(
    { type: 'response.created', response: { id: 'resp_up' } },
    { type: 'response.output_item.done', item },
    { type: 'response.completed', response: { id: 'resp_up', output: [item], usage: { input_tokens: 900, output_tokens: 40, total_tokens: 940 } } },
  );
}

function upstream(t: TestContext, reply: (body: any) => Reply = () => ({ status: 200, body: summaryStream(), contentType: 'text/event-stream' })) {
  const requests: Recorded[] = [];
  const socketMessages: any[] = [];
  const upgrades: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body: any = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
      requests.push({ path: String(req.url), body });
      const answer = reply(body);
      res.writeHead(answer.status, { 'content-type': answer.contentType || 'application/json' });
      res.end(answer.body);
    });
  });
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<net.Socket>();
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    upgrades.push(String(req.url));
    wss.handleUpgrade(req, socket, head, (ws) => {
      ws.on('error', () => undefined);
      ws.on('message', (data, binary) => {
        socketMessages.push(JSON.parse(String(data)));
        ws.send(data, { binary });
      });
    });
  });
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { server, requests, socketMessages, upgrades };
}

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

async function fixture(t: TestContext, options: { mode?: DesktopBridgeOpenRouterOnlyConfig; lbReply?: (body: any) => Reply } = {}) {
  const lb = upstream(t, options.lbReply);
  const openrouter = upstream(t);
  const official = upstream(t, () => ({ status: 200, body: '{"ok":true}' }));
  const lbBase = `http://127.0.0.1:${await listen(lb.server)}/backend-api/codex`;
  const orBase = `http://127.0.0.1:${await listen(openrouter.server)}/api/v1`;
  const officialBase = `http://127.0.0.1:${await listen(official.server)}/backend-api/codex`;
  const port = await selectAvailableDesktopBridgePort('127.0.0.1');
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: {
      schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-10-05T00:00:00.000Z',
      providers: {
        'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'x-codex-lb-api-key', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
        openrouter: { provider_id: 'openrouter', enabled: true, base_url: orBase, allowed_origins: [new URL(orBase).origin], auth_transport: 'openrouter-bearer', credential_state: 'ready', credential_fingerprint: 'or-fp', credential_generation: 'or-credential', source_catalog_generation: 'or-catalog' },
      },
    },
    routePolicy: {
      schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'openrouter', fallback: 'none',
      model_routes: {
        'gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb-upstream' },
        [LISTED]: { provider_id: 'openrouter', upstream_model: LISTED },
        'official-model': { provider_id: 'openai', upstream_model: 'official-model' },
      },
      catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-10-05T00:00:00.000Z',
    },
    providerSessionPins: [],
    persistProviderSessionPins: async () => undefined,
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: `${providerId}-secret`, source: 'test', fingerprint: providerId === 'codex-lb' ? 'lb-fp' : 'or-fp' }),
    clientCapabilitySha256: createHash('sha256').update(CAPABILITY).digest('hex'),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 1_000, idleTimeoutMs: 5_000,
    officialPassthrough: { baseUrl: officialBase },
    ...(options.mode ? { openRouterOnly: options.mode } : {}),
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());

  async function post(path: string, body: unknown): Promise<{ status: number; contentType: string; text: string }> {
    const payload = Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port, method: 'POST', path: desktopBridgeClientPath(CAPABILITY, path),
        headers: { 'content-type': 'application/json', 'content-length': String(payload.length), origin: 'app://codex', authorization: 'Bearer client-oauth', ...ROOT_HEADERS },
      }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode || 0, contentType: String(response.headers['content-type'] || ''), text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.once('error', reject);
      request.end(payload);
    });
  }
  async function socket() {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses')}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth', ...ROOT_HEADERS } });
    ws.on('error', () => undefined);
    t.after(() => ws.terminate());
    await once(ws, 'open');
    return ws;
  }
  return { lb, openrouter, official, post, socket };
}

function events(text: string): any[] {
  return text.split(/\n\n/).map((block) => block.split('\n').find((line) => line.startsWith('data: '))).filter(Boolean).map((line) => JSON.parse(line!.slice(6)));
}

test('HTTP: a Codex-LB thread compacts through its own provider and later turns carry the summary', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const compaction = await f.post('/backend-api/codex/responses', {
    model: 'gpt-lb', stream: true, store: false, instructions: 'base', tools: TOOLS, parallel_tool_calls: true,
    input: [user('fix the parser'), { type: 'compaction_trigger' }],
  });
  assert.equal(compaction.status, 200);
  assert.match(compaction.contentType, /text\/event-stream/);
  const stream = events(compaction.text);
  assert.deepEqual(stream.map((event) => event.type), ['response.created', 'response.output_item.done', 'response.completed']);
  const item = stream[1].item;
  assert.equal(item.type, 'compaction');
  assert.equal(decodeBridgeCompaction(item.encrypted_content), SUMMARY);
  assert.equal(stream[2].response.id, stream[0].response.id);
  assert.deepEqual(stream[2].response.usage, { input_tokens: 900, output_tokens: 40, total_tokens: 940 });

  assert.equal(f.lb.requests.length, 1);
  const summaryRequest = f.lb.requests[0]!;
  assert.equal(summaryRequest.path, '/backend-api/codex/responses');
  assert.equal(summaryRequest.body.model, 'gpt-lb-upstream');
  assert.equal(summaryRequest.body.tool_choice, 'none');
  assert.equal(summaryRequest.body.input.some((entry: any) => entry.type === 'compaction_trigger'), false);
  assert.deepEqual(summaryRequest.body.input.at(-1), user(CODEX_SUMMARIZATION_PROMPT));
  assert.equal(f.official.requests.length, 0, 'a provider thread never compacts on the official identity');

  // The next turn sends the compaction item back; the provider receives the summary.
  const next = await f.post('/backend-api/codex/responses', { model: 'gpt-lb', stream: true, input: [user('fix the parser'), item, user('continue')] });
  assert.equal(next.status, 200);
  const forwarded = f.lb.requests[1]!.body.input;
  assert.deepEqual(forwarded[1], user(`${CODEX_SUMMARY_PREFIX}\n${SUMMARY}`));
  assert.equal(JSON.stringify(forwarded).includes('sks-bridge-compaction'), false);
});

test('HTTP: an official thread keeps native remote compaction', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const result = await f.post('/backend-api/codex/responses', { model: 'official-model', input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(result.status, 200);
  assert.deepEqual(f.official.requests.map((row) => row.body.input.at(-1)), [{ type: 'compaction_trigger' }]);
  assert.equal(f.lb.requests.length, 0);
});

test('HTTP: a provider that refuses the summary request is reported, not hidden', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { lbReply: () => ({ status: 400, body: JSON.stringify({ error: { type: 'invalid_request_error', code: 'unsupported_parameter', message: 'secret request echo' } }) }) });
  const result = await f.post('/backend-api/codex/responses', { model: 'gpt-lb', input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(result.status, 400);
  const body = JSON.parse(result.text);
  assert.equal(body.error.code, 'bridge_upstream_request_failed');
  assert.equal(body.error.upstream_code, 'unsupported_parameter');
  assert.equal(result.text.includes('secret request echo'), false);
});

test('HTTP: OpenRouter Only answers /responses/compact with a summary from the OpenRouter model', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { mode: { enabled: true, subagent_models: [LISTED] } });
  const result = await f.post('/backend-api/codex/responses/compact', { model: LISTED, input: [user('one'), user('two')] });
  assert.equal(result.status, 200);
  const output = JSON.parse(result.text).output;
  assert.deepEqual(output.slice(0, 2), [user('one'), user('two')]);
  assert.equal(output.at(-1).type, 'compaction');
  assert.equal(decodeBridgeCompaction(output.at(-1).encrypted_content), SUMMARY);
  assert.deepEqual(f.openrouter.requests.map((row) => row.path), ['/api/v1/responses']);
  assert.deepEqual(f.openrouter.requests[0]!.body.input.at(-1), user(CODEX_SUMMARIZATION_PROMPT));
  assert.equal(f.official.requests.length, 0);
});

test('Responses WebSocket: a provider-bound socket answers compaction itself and expands the item on the next create', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const ws = await f.socket();
  const received: any[] = [];
  ws.on('message', (data) => received.push(JSON.parse(String(data))));
  ws.send(JSON.stringify({ type: 'response.create', model: 'gpt-lb', input: [user('fix the parser'), { type: 'compaction_trigger' }] }));
  while (received.length < 3) await once(ws, 'message');
  assert.deepEqual(received.map((event) => event.type), ['response.created', 'response.output_item.done', 'response.completed']);
  const item = received[1].item;
  assert.equal(decodeBridgeCompaction(item.encrypted_content), SUMMARY);
  assert.deepEqual(f.lb.socketMessages, [], 'the compaction create is not relayed to the provider socket');
  assert.equal(f.lb.requests.length, 1, 'the summary was requested over HTTP');

  ws.send(JSON.stringify({ type: 'response.create', model: 'gpt-lb', input: [item, user('continue')] }));
  while (received.length < 4) await once(ws, 'message');
  const echoed = received[3];
  assert.equal(echoed.type, 'response.create');
  assert.equal(echoed.model, 'gpt-lb-upstream');
  assert.deepEqual(echoed.input[0], user(`${CODEX_SUMMARY_PREFIX}\n${SUMMARY}`));
});

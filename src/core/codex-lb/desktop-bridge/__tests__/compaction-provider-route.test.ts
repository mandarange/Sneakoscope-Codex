import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http, { type IncomingHttpHeaders } from 'node:http';
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
// OpenAI). Codex-LB runs that compaction itself on the thread's own account,
// so its requests travel like any other turn; OpenRouter has none, so the
// bridge answers with a summary from the thread's own model.

const CAPABILITY = Buffer.alloc(32, 0x5a).toString('base64url');
const SESSION = '019fd56f-d48f-7942-a560-48ad9ef47223';
const LISTED = 'vendor/listed';
const ROOT_HEADERS = {
  'thread-id': SESSION, 'session-id': SESSION, 'user-agent': 'Codex Desktop/0.163.0', originator: 'Codex Desktop',
  'x-codex-turn-metadata': JSON.stringify({ session_id: SESSION, thread_id: SESSION, thread_source: 'user' }),
};
const SUMMARY = 'Summary: the parser is fixed; next, add the regression test.';
const TOOLS = [{ type: 'function', name: 'shell', parameters: { type: 'object', properties: {} } }];
const user = (text: string) => ({ type: 'message', role: 'user', content: [{ type: 'input_text', text }] });
/** What a native compaction returns: an item only the producing account can read. */
const NATIVE_ITEM = { type: 'compaction', id: 'cmp_native_1', encrypted_content: 'gAAAAABnative-opaque-account-bound' };

type Reply = { status: number; body: string; contentType?: string; delayMs?: number };
interface Recorded { path: string; body: any; headers: IncomingHttpHeaders }

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

function nativeCompactionStream(): string {
  return sse(
    { type: 'response.created', response: { id: 'resp_cmp' } },
    { type: 'response.output_item.done', output_index: 0, item: NATIVE_ITEM },
    { type: 'response.completed', response: { id: 'resp_cmp', output: [NATIVE_ITEM] } },
  );
}

function upstream(
  t: TestContext,
  reply: (body: any, path: string) => Reply = () => ({ status: 200, body: summaryStream(), contentType: 'text/event-stream' }),
  /** Events a socket answers a create with; the default echoes the create back. */
  socketReply?: (message: any) => object[],
) {
  const requests: Recorded[] = [];
  const socketMessages: any[] = [];
  const upgrades: string[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      let body: any = null;
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { /* not JSON */ }
      requests.push({ path: String(req.url), body, headers: req.headers });
      const answer = reply(body, String(req.url));
      setTimeout(() => {
        res.writeHead(answer.status, { 'content-type': answer.contentType || 'application/json' });
        res.end(answer.body);
      }, answer.delayMs ?? 0);
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
        const message = JSON.parse(String(data));
        socketMessages.push(message);
        if (socketReply) for (const event of socketReply(message)) ws.send(JSON.stringify(event));
        else ws.send(data, { binary });
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

interface FixtureOptions {
  mode?: DesktopBridgeOpenRouterOnlyConfig;
  lbReply?: (body: any, path: string) => Reply;
  lbSocketReply?: (message: any) => object[];
  orReply?: (body: any, path: string) => Reply;
  orSocketReply?: (message: any) => object[];
  idleTimeoutMs?: number;
}

async function fixture(t: TestContext, options: FixtureOptions = {}) {
  const lb = upstream(t, options.lbReply ?? (() => ({ status: 200, body: nativeCompactionStream(), contentType: 'text/event-stream' })), options.lbSocketReply);
  const openrouter = upstream(t, options.orReply, options.orSocketReply);
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
        'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'authorization-bearer', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
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
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 1_000, idleTimeoutMs: options.idleTimeoutMs ?? 5_000,
    officialPassthrough: { baseUrl: officialBase },
    ...(options.mode ? { openRouterOnly: options.mode } : {}),
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());

  async function post(path: string, body: unknown, headers: Record<string, string> = ROOT_HEADERS): Promise<{ status: number; contentType: string; text: string }> {
    const payload = Buffer.from(JSON.stringify(body));
    return new Promise((resolve, reject) => {
      const request = http.request({
        host: '127.0.0.1', port, method: 'POST', path: desktopBridgeClientPath(CAPABILITY, path),
        headers: { 'content-type': 'application/json', 'content-length': String(payload.length), origin: 'app://codex', authorization: 'Bearer client-oauth', 'chatgpt-account-id': 'acct-operator', ...headers },
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

test('HTTP: a Codex-LB thread compacts natively, and the item it returns travels back unchanged', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const trigger = {
    model: 'gpt-lb', stream: true, store: false, instructions: 'base', tools: TOOLS, parallel_tool_calls: true,
    input: [user('fix the parser'), { type: 'compaction_trigger' }],
  };
  const compaction = await f.post('/backend-api/codex/responses', trigger);
  assert.equal(compaction.status, 200);
  assert.deepEqual(events(compaction.text), events(nativeCompactionStream()), 'Codex-LB\'s own events reach Codex as sent');

  assert.equal(f.lb.requests.length, 1);
  const forwarded = f.lb.requests[0]!;
  assert.equal(forwarded.path, '/backend-api/codex/responses');
  assert.deepEqual(forwarded.body, { ...trigger, model: 'gpt-lb-upstream' }, 'only the model alias changes');
  // The same headers as any turn, so Codex-LB runs it on the thread's own account.
  assert.equal(forwarded.headers['thread-id'], SESSION);
  assert.equal(forwarded.headers['session-id'], SESSION);
  assert.equal(forwarded.headers['user-agent'], 'Codex Desktop/0.163.0');
  assert.equal(forwarded.headers.originator, 'Codex Desktop');
  assert.equal(forwarded.headers.authorization, 'Bearer codex-lb-secret');
  assert.equal(forwarded.headers['chatgpt-account-id'], undefined);
  assert.equal(f.official.requests.length + f.openrouter.requests.length, 0, 'a Codex-LB thread never compacts elsewhere');

  const next = await f.post('/backend-api/codex/responses', { model: 'gpt-lb', stream: true, input: [user('fix the parser'), NATIVE_ITEM, user('continue')] });
  assert.equal(next.status, 200);
  assert.deepEqual(f.lb.requests[1]!.body.input[1], NATIVE_ITEM);
});

test('HTTP: a native compaction outlives an idle limit shorter than it takes', { timeout: 20_000 }, async (t) => {
  // Codex-LB streams nothing between accepting a compaction and finishing it;
  // 45-150 s live. A turn that silent is cut at the idle limit, a compaction is not.
  const f = await fixture(t, {
    idleTimeoutMs: 1_000,
    lbReply: (body) => ({ status: 200, contentType: 'text/event-stream', body: nativeCompactionStream(), delayMs: 1_600 }),
  });
  const plain = await f.post('/backend-api/codex/responses', { model: 'gpt-lb', input: [user('hi')] });
  assert.equal(plain.status, 502);
  assert.match(plain.text, /bridge_upstream_idle_timeout/);
  const compaction = await f.post('/backend-api/codex/responses', { model: 'gpt-lb', input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(compaction.status, 200);
  assert.deepEqual(events(compaction.text).map((event) => event.type), ['response.created', 'response.output_item.done', 'response.completed']);
});

test('HTTP: /responses/compact for a Codex-LB thread goes to Codex-LB, never to the official identity', { timeout: 20_000 }, async (t) => {
  const output = [user('one'), NATIVE_ITEM];
  const f = await fixture(t, { lbReply: () => ({ status: 200, body: JSON.stringify({ output }) }) });
  const result = await f.post('/backend-api/codex/responses/compact', { model: 'gpt-lb', input: [user('one'), user('two')] });
  assert.equal(result.status, 200);
  assert.deepEqual(JSON.parse(result.text), { output });
  assert.deepEqual(f.lb.requests.map((row) => [row.path, row.body.model]), [['/backend-api/codex/responses/compact', 'gpt-lb-upstream']]);
  assert.equal(f.lb.requests[0]!.headers['thread-id'], SESSION);
  assert.equal(f.official.requests.length, 0);
});

test('HTTP: a Codex-LB-pinned thread naming an unknown model fails instead of leaving for the official identity', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  assert.equal((await f.post('/backend-api/codex/responses', { model: 'gpt-lb', input: [user('hi')] })).status, 200);
  const unknown = await f.post('/backend-api/codex/responses/compact', { model: 'retired-model', input: [user('hi')] });
  assert.equal(unknown.status, 409);
  assert.match(unknown.text, /catalog_model_route_missing/);
  assert.equal(f.official.requests.length, 0);
});

test('HTTP: an OpenRouter thread compacts through its own model and later turns carry the summary', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const compaction = await f.post('/backend-api/codex/responses', {
    model: LISTED, stream: true, store: false, instructions: 'base', tools: TOOLS, parallel_tool_calls: true,
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

  assert.equal(f.openrouter.requests.length, 1);
  const summaryRequest = f.openrouter.requests[0]!;
  assert.equal(summaryRequest.path, '/api/v1/responses');
  assert.equal(summaryRequest.body.model, LISTED);
  assert.equal(summaryRequest.body.tool_choice, 'none');
  assert.equal(summaryRequest.body.parallel_tool_calls, false);
  assert.equal(summaryRequest.body.input.some((entry: any) => entry.type === 'compaction_trigger'), false);
  assert.deepEqual(summaryRequest.body.input.at(-1), user(CODEX_SUMMARIZATION_PROMPT));
  assert.equal(f.official.requests.length, 0, 'a provider thread never compacts on the official identity');

  // The next turn sends the compaction item back; the provider receives the summary.
  const next = await f.post('/backend-api/codex/responses', { model: LISTED, stream: true, input: [user('fix the parser'), item, user('continue')] });
  assert.equal(next.status, 200);
  const forwarded = f.openrouter.requests[1]!.body.input;
  assert.deepEqual(forwarded[1], user(`${CODEX_SUMMARY_PREFIX}\n${SUMMARY}`));
  assert.equal(JSON.stringify(forwarded).includes('sks-bridge-compaction'), false);
});

const LITE_REFUSAL = { message: 'X-OpenAI-Internal-Codex-Responses-Lite requires `parallel_tool_calls` to be false.', type: 'invalid_request_error', code: 'unsupported_value', param: 'parallel_tool_calls' };

test('HTTP: a summary the provider fails in-stream reaches Codex with the provider code, never its message', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { orReply: () => ({ status: 200, contentType: 'text/event-stream', body: sse({ type: 'response.failed', response: { status: 'failed', error: LITE_REFUSAL } }) }) });
  const result = await f.post('/backend-api/codex/responses', { model: LISTED, input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(result.status, 200);
  const stream = events(result.text);
  assert.deepEqual(stream.map((event) => event.type), ['response.created', 'response.failed']);
  assert.equal(stream[1].response.error.code, 'unsupported_value');
  assert.equal(result.text.includes('requires'), false);
});

test('HTTP: an official thread keeps native remote compaction', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const result = await f.post('/backend-api/codex/responses', { model: 'official-model', input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(result.status, 200);
  assert.deepEqual(f.official.requests.map((row) => row.body.input.at(-1)), [{ type: 'compaction_trigger' }]);
  assert.equal(f.lb.requests.length, 0);
});

test('HTTP: a provider that refuses the summary request is reported, not hidden', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { orReply: () => ({ status: 400, body: JSON.stringify({ error: { type: 'invalid_request_error', code: 'unsupported_parameter', message: 'secret request echo' } }) }) });
  const result = await f.post('/backend-api/codex/responses', { model: LISTED, input: [user('hi'), { type: 'compaction_trigger' }] });
  assert.equal(result.status, 400);
  const body = JSON.parse(result.text);
  assert.equal(body.error.code, 'bridge_upstream_request_failed');
  assert.equal(body.error.upstream_code, 'unsupported_parameter');
  assert.equal(result.text.includes('secret request echo'), false);
});

test('HTTP: /responses/compact for an OpenRouter thread is a summary from the OpenRouter model, with or without OpenRouter Only', { timeout: 20_000 }, async (t) => {
  for (const mode of [{ enabled: true, subagent_models: [LISTED] }, undefined]) {
    const f = await fixture(t, mode ? { mode } : {});
    const result = await f.post('/backend-api/codex/responses/compact', { model: LISTED, input: [user('one'), user('two')] });
    assert.equal(result.status, 200);
    const output = JSON.parse(result.text).output;
    assert.deepEqual(output.slice(0, 2), [user('one'), user('two')]);
    assert.equal(output.at(-1).type, 'compaction');
    assert.equal(decodeBridgeCompaction(output.at(-1).encrypted_content), SUMMARY);
    assert.deepEqual(f.openrouter.requests.map((row) => row.path), ['/api/v1/responses']);
    assert.deepEqual(f.openrouter.requests[0]!.body.input.at(-1), user(CODEX_SUMMARIZATION_PROMPT));
    assert.equal(f.official.requests.length, 0);
  }
});

test('Responses WebSocket: a Codex-LB socket relays the compaction create to Codex-LB unchanged', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t, { lbSocketReply: () => [
    { type: 'response.created', response: { id: 'resp_cmp' } },
    { type: 'response.output_item.done', output_index: 0, item: NATIVE_ITEM },
    { type: 'response.completed', response: { id: 'resp_cmp', output: [NATIVE_ITEM] } },
  ] });
  const ws = await f.socket();
  const received: any[] = [];
  ws.on('message', (data) => received.push(JSON.parse(String(data))));
  const create = { type: 'response.create', model: 'gpt-lb', tools: TOOLS, parallel_tool_calls: false, input: [user('fix the parser'), { type: 'compaction_trigger' }] };
  ws.send(JSON.stringify(create));
  while (received.length < 3) await once(ws, 'message');
  assert.deepEqual(received[1].item, NATIVE_ITEM);
  assert.deepEqual(f.lb.socketMessages, [{ ...create, model: 'gpt-lb-upstream' }]);
  assert.equal(f.lb.requests.length + f.openrouter.requests.length + f.official.requests.length, 0, 'no bridge-built summary request');
});

test('Responses WebSocket: an OpenRouter socket answers compaction itself and expands the item on the next create', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const ws = await f.socket();
  const received: any[] = [];
  ws.on('message', (data) => received.push(JSON.parse(String(data))));
  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, input: [user('fix the parser'), { type: 'compaction_trigger' }] }));
  while (received.length < 3) await once(ws, 'message');
  assert.deepEqual(received.map((event) => event.type), ['response.created', 'response.output_item.done', 'response.completed']);
  const item = received[1].item;
  assert.equal(decodeBridgeCompaction(item.encrypted_content), SUMMARY);
  assert.deepEqual(f.openrouter.socketMessages, [], 'the compaction create is not relayed to the provider socket');
  assert.equal(f.openrouter.requests.length, 1, 'the summary was requested over HTTP');

  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, input: [item, user('continue')] }));
  while (received.length < 4) await once(ws, 'message');
  const echoed = received[3];
  assert.equal(echoed.type, 'response.create');
  assert.equal(echoed.model, LISTED);
  assert.deepEqual(echoed.input[0], user(`${CODEX_SUMMARY_PREFIX}\n${SUMMARY}`));
});

test('Responses WebSocket: a continued OpenRouter socket compacts the whole conversation, not just the delta', { timeout: 20_000 }, async (t) => {
  // Codex continues a response by id and sends only the new items; the summary
  // request built from that delta alone was refused (param `input`) live.
  const call = { type: 'function_call', call_id: 'c1', name: 'shell', arguments: '{"command":"ls"}' };
  const output = { type: 'function_call_output', call_id: 'c1', output: 'README.md' };
  const f = await fixture(t, { orSocketReply: () => [
    { type: 'response.created', response: { id: 'resp_1', error: null } },
    { type: 'response.output_item.done', output_index: 0, item: call },
    { type: 'response.completed', response: { id: 'resp_1', output: [call] } },
  ] });
  const ws = await f.socket();
  const received: any[] = [];
  ws.on('message', (data) => received.push(JSON.parse(String(data))));
  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, input: [user('list the files')] }));
  while (received.length < 3) await once(ws, 'message');
  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, previous_response_id: 'resp_1', input: [output, { type: 'compaction_trigger' }] }));
  while (received.length < 6) await once(ws, 'message');
  assert.deepEqual(received.slice(3).map((event) => event.type), ['response.created', 'response.output_item.done', 'response.completed']);
  const summaryRequest = f.openrouter.requests[0]!.body;
  assert.deepEqual(summaryRequest.input.slice(0, 3), [user('list the files'), call, output]);
  assert.deepEqual(summaryRequest.input.at(-1), user(CODEX_SUMMARIZATION_PROMPT));
  assert.equal(summaryRequest.previous_response_id, undefined);

  // A continuation this socket never carried cannot be vouched for: a
  // retryable failure at once (Codex then resends the full history), and no
  // provider call built from a fragment.
  ws.send(JSON.stringify({ type: 'response.create', model: LISTED, previous_response_id: 'resp_unknown', input: [{ type: 'compaction_trigger' }] }));
  while (received.length < 7) await once(ws, 'message');
  assert.equal(received[6].type, 'response.failed');
  assert.equal(received[6].response.error.code, 'bridge_compaction_history_unavailable');
  assert.equal(f.openrouter.requests.length, 1);
});

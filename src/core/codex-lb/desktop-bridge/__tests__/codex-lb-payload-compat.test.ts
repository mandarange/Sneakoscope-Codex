import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import http from 'node:http';
import net, { type AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import zlib from 'node:zlib';
import WebSocket, { WebSocketServer } from 'ws';
import { desktopBridgeClientPath, selectAvailableDesktopBridgePort, startDesktopBridge, type DesktopBridgeConfig } from '../index.js';

// Through the bridge Codex always sees an "OpenAI" provider, so with output-token
// replay on it asks Codex-LB for `output.encrypted_content`, which Codex-LB
// refuses on every turn. The fake below enforces Codex-LB's own rules.

const CAPABILITY = Buffer.alloc(32, 0x5a).toString('base64url');
const MODEL = 'gpt-6-astra';
const OFFICIAL_MODEL = 'gpt-official';
const PROMPT = 'PROMPT-TEXT-never-in-a-log';
const THREAD = '019fd56f-2222-7942-a560-48ad9ef47223';
const CODEX_LB_INCLUDE_ALLOWLIST = new Set([
  'code_interpreter_call.outputs', 'computer_call_output.output.image_url', 'file_search_call.results',
  'message.input_image.image_url', 'message.output_text.logprobs', 'reasoning.encrypted_content', 'web_search_call.action.sources',
]);
const INVALID = (param: string | null) => ({ message: 'Invalid request payload', type: 'invalid_request_error', code: 'invalid_request_error', ...(param ? { param } : {}) });
const zstd = zlib as unknown as { zstdCompressSync?: (b: Buffer) => Buffer; zstdDecompressSync?: (b: Buffer) => Buffer };

type Payload = Record<string, unknown>;
const developer = { type: 'message', role: 'developer', content: [{ type: 'input_text', text: 'base instructions' }] };
const user = { type: 'message', role: 'user', content: [{ type: 'input_text', text: PROMPT }] };
const tools = [{ type: 'function', name: 'shell', parameters: { type: 'object', properties: {} } }];
const common = {
  model: MODEL, tool_choice: 'auto', parallel_tool_calls: false, reasoning: { effort: 'medium', summary: 'auto' },
  store: false, stream: true, include: ['reasoning.encrypted_content', 'output.encrypted_content'],
  prompt_cache_key: THREAD, service_tier: 'priority', text: { verbosity: 'low' },
  client_metadata: { session_id: THREAD, thread_id: THREAD }, stream_options: { include_obfuscation: false },
};
const FIXTURES: Record<string, Payload> = {
  'Codex main, Lite, no instructions': { ...common, input: [developer, { type: 'additional_tools', tools }, user] },
  'Codex main, non-Lite, no instructions': { ...common, tools, input: [developer, user] },
  'native compaction (compaction_trigger)': { ...common, tools, input: [developer, user, { type: 'compaction_trigger' }] },
  'legacy, top-level instructions': { ...common, instructions: 'base instructions', tools, input: [user] },
};

function invalidInclude(body: Payload): boolean {
  return Array.isArray(body.include) && body.include.some((value) => !CODEX_LB_INCLUDE_ALLOWLIST.has(String(value)));
}

/** Codex-LB when `enforce`; the official backend, which takes what Codex sends, otherwise. */
function upstream(t: TestContext, enforce: boolean) {
  const bodies: Payload[] = [];
  const raw: Buffer[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const received = Buffer.concat(chunks);
      raw.push(received);
      const encoding = req.headers['content-encoding'];
      let body: Payload;
      try {
        body = JSON.parse((encoding === 'zstd' ? zstd.zstdDecompressSync!(received) : encoding === 'gzip' ? zlib.gunzipSync(received) : received).toString('utf8'));
      } catch {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end('{"detail":"There was an error parsing the body"}');
        return;
      }
      bodies.push(body);
      if (enforce && invalidInclude(body)) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: INVALID('include') }));
        return;
      }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      res.end('event: response.completed\ndata: {"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[]}}\n\n');
    });
  });
  const frames: Array<{ body: Payload | null; binary: boolean }> = [];
  const wss = new WebSocketServer({ noServer: true });
  const sockets = new Set<net.Socket>();
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => wss.handleUpgrade(req, socket, head, (ws) => {
    ws.on('error', () => undefined);
    ws.on('message', (data, binary) => {
      let body: Payload | null = null;
      if (!binary) { try { body = JSON.parse(String(data)); } catch { body = null; } }
      frames.push({ body, binary });
      // Codex-LB answers a binary or non-JSON frame and a refused create alike, and logs none of them.
      if (!body || (enforce && invalidInclude(body))) {
        ws.send(JSON.stringify({ type: 'error', status: 400, error: INVALID(body ? 'include' : null) }));
        return;
      }
      ws.send('{"type":"response.completed","response":{"id":"resp_1","status":"completed","output":[]}}');
    });
  }));
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    wss.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return { server, bodies, raw, frames };
}

async function listen(server: net.Server): Promise<number> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as AddressInfo).port;
}

/** The bridge's own log lines, captured from stdout while the test runs. */
function captureBridgeLog(t: TestContext): Array<Record<string, any>> {
  const lines: Array<Record<string, any>> = [];
  const original = process.stdout.write;
  process.stdout.write = function write(this: NodeJS.WriteStream, chunk: unknown, ...rest: unknown[]): boolean {
    const text = typeof chunk === 'string' ? chunk : Buffer.isBuffer(chunk) ? chunk.toString('utf8') : '';
    if (text.startsWith('{"schema":"sks.desktop-bridge-log.v2"')) {
      for (const line of text.trim().split('\n')) lines.push(JSON.parse(line));
      return true;
    }
    return (original as (...args: unknown[]) => boolean).call(this, chunk, ...rest);
  } as typeof process.stdout.write;
  t.after(() => { process.stdout.write = original; });
  return lines;
}

async function fixture(t: TestContext, options: { extraInclude?: string[] } = {}) {
  const lb = upstream(t, true);
  const official = upstream(t, false);
  const lbBase = `http://127.0.0.1:${await listen(lb.server)}/backend-api/codex`;
  const officialBase = `http://127.0.0.1:${await listen(official.server)}/backend-api/codex`;
  const port = await selectAvailableDesktopBridgePort('127.0.0.1');
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: { schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-10-28T00:00:00.000Z', providers: {
      'codex-lb': {
        provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'x-codex-lb-api-key',
        credential_state: 'ready', credential_fingerprint: 'fp', credential_generation: 'credential', source_catalog_generation: 'catalog',
        ...(options.extraInclude ? { request_compat: { extra_include: options.extraInclude } } : {}),
      },
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
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());
  const path = desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses');
  async function post(body: Buffer, encoding: string | null): Promise<{ status: number; text: string }> {
    return new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method: 'POST', path, headers: {
        'content-type': 'application/json', 'content-length': String(body.length), origin: 'app://codex', authorization: 'Bearer client-oauth',
        ...(encoding ? { 'content-encoding': encoding } : {}),
      } }, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => resolve({ status: response.statusCode || 0, text: Buffer.concat(chunks).toString('utf8') }));
      });
      request.once('error', reject);
      request.end(body);
    });
  }
  async function exchange(create: Payload): Promise<Payload> {
    const ws = new WebSocket(`ws://127.0.0.1:${port}${path}`, { headers: { origin: 'app://codex', authorization: 'Bearer client-oauth' } });
    ws.on('error', () => undefined);
    t.after(() => ws.terminate());
    await once(ws, 'open');
    const reply = once(ws, 'message');
    ws.send(JSON.stringify(create));
    return JSON.parse(String((await reply)[0]));
  }
  return { lb, official, post, exchange };
}

const withoutInclude = ({ include: _include, ...rest }: Payload) => rest;
const compressed = (payload: Payload): { body: Buffer; encoding: string } => {
  const plain = Buffer.from(JSON.stringify(payload));
  return zstd.zstdCompressSync ? { body: zstd.zstdCompressSync(plain), encoding: 'zstd' } : { body: zlib.gzipSync(plain), encoding: 'gzip' };
};
const adaptations = (lines: Array<Record<string, any>>) => lines.filter((line) => line.event === 'sks.desktop_bridge.request_adapted');

for (const [name, payload] of Object.entries(FIXTURES)) {
  test(`${name}: Codex-LB receives only the include values it accepts (HTTP and WebSocket)`, { timeout: 20_000 }, async (t) => {
    const log = captureBridgeLog(t);
    const http1 = await fixture(t);
    const { body, encoding } = compressed(payload);
    const answer = await http1.post(body, encoding);
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(http1.lb.bodies[0]!.include, ['reasoning.encrypted_content']);
    assert.deepEqual(withoutInclude(http1.lb.bodies[0]!), withoutInclude(payload), 'nothing else changed');
    assert.deepEqual(adaptations(log).map((line) => [line.transport, line.provider_id, line.value, line.count]), [['http', 'codex-lb', 'output.encrypted_content', 1]]);

    const ws = await fixture(t);
    const create = { type: 'response.create', ...payload };
    const reply = await ws.exchange(create);
    assert.equal(reply.type, 'response.completed');
    assert.equal(ws.lb.frames.length, 1);
    assert.equal(ws.lb.frames[0]!.binary, false, 'a rewritten create stays a text frame');
    assert.deepEqual(ws.lb.frames[0]!.body!.include, ['reasoning.encrypted_content']);
    assert.deepEqual(withoutInclude(ws.lb.frames[0]!.body!), withoutInclude(create));
    assert.deepEqual(adaptations(log).slice(1).map((line) => [line.transport, line.value]), [['websocket', 'output.encrypted_content']]);
    assert.equal(JSON.stringify(log).includes(PROMPT), false);
  });
}

test('the official route receives exactly the bytes Codex sent, output replay included', { timeout: 20_000 }, async (t) => {
  const log = captureBridgeLog(t);
  const f = await fixture(t);
  const payload = { ...FIXTURES['Codex main, Lite, no instructions']!, model: OFFICIAL_MODEL };
  const plain = Buffer.from(JSON.stringify(payload));
  assert.equal((await f.post(plain, null)).status, 200);
  assert.ok(f.official.raw[0]!.equals(plain), 'byte-for-byte');
  assert.deepEqual(f.official.bodies[0]!.include, ['reasoning.encrypted_content', 'output.encrypted_content']);
  const reply = await f.exchange({ type: 'response.create', ...payload });
  assert.equal(reply.type, 'response.completed');
  assert.deepEqual(f.official.frames[0]!.body, { type: 'response.create', ...payload });
  assert.equal(f.lb.bodies.length + f.lb.frames.length, 0);
  assert.deepEqual(adaptations(log), []);
});

test('a refused request is logged once with the field Codex-LB named and the request shape, never its content', { timeout: 20_000 }, async (t) => {
  const log = captureBridgeLog(t);
  // An operator kept output replay for a Codex-LB that does not accept it yet.
  const f = await fixture(t, { extraInclude: ['output.encrypted_content'] });
  const payload = { ...FIXTURES['legacy, top-level instructions']!, instructions: `instructions ${PROMPT}` };
  const answer = await f.post(Buffer.from(JSON.stringify(payload)), null);
  assert.equal(answer.status, 400);
  assert.deepEqual(JSON.parse(answer.text), { error: INVALID('include') }, 'Codex-LB errors reach Codex as sent');
  const rejected = () => log.filter((line) => line.code === 'bridge_upstream_request_rejected');
  assert.equal(rejected().length, 1);
  const [httpLine] = rejected();
  assert.deepEqual(
    [httpLine!.transport, httpLine!.provider_id, httpLine!.public_model, httpLine!.status, httpLine!.upstream_status, httpLine!.upstream_code, httpLine!.upstream_type, httpLine!.upstream_param],
    ['http', 'codex-lb', MODEL, 400, 400, 'invalid_request_error', 'invalid_request_error', 'include'],
  );
  assert.deepEqual(httpLine!.request_shape.include, ['reasoning.encrypted_content', 'output.encrypted_content']);
  assert.deepEqual(httpLine!.request_shape.input_types, { message: 1 });
  assert.deepEqual(httpLine!.request_shape.keys, Object.keys(payload).sort());

  const reply = await f.exchange({ type: 'response.create', ...payload });
  assert.deepEqual(reply, { type: 'error', status: 400, error: INVALID('include') });
  assert.equal(rejected().length, 2);
  const wsLine = rejected()[1]!;
  assert.deepEqual([wsLine.transport, wsLine.status, wsLine.upstream_param, wsLine.upstream_code], ['websocket', 400, 'include', 'invalid_request_error']);
  assert.deepEqual(wsLine.request_shape.keys, Object.keys({ type: 'response.create', ...payload }).sort());
  const text = JSON.stringify(log);
  assert.equal(text.includes(PROMPT), false, 'no prompt or instructions text in the log');
  assert.equal(text.includes('base instructions'), false);
  assert.equal(text.includes('lb-secret'), false);
});

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import http, { type IncomingHttpHeaders } from 'node:http';
import type { AddressInfo } from 'node:net';
import test, { type TestContext } from 'node:test';
import zlib from 'node:zlib';
import { desktopBridgeClientPath, selectAvailableDesktopBridgePort, startDesktopBridge, type DesktopBridgeConfig } from '../index.js';

// An upstream answers 400 "There was an error parsing the body" when compressed
// bytes arrive without a matching Content-Encoding, or a body arrives cut short.
// Whatever the bridge rewrites, the headers it forwards must describe the bytes.

const CAPABILITY = Buffer.alloc(32, 0x6b).toString('base64url');
const zstd = zlib as unknown as { zstdCompressSync?: (b: Buffer) => Buffer; zstdDecompressSync?: (b: Buffer) => Buffer };

interface Received { headers: IncomingHttpHeaders; raw: Buffer }

function decode(row: Received): Record<string, unknown> {
  const encoding = row.headers['content-encoding'];
  const plain = encoding === 'zstd' ? zstd.zstdDecompressSync!(row.raw) : encoding === 'gzip' ? zlib.gunzipSync(row.raw) : row.raw;
  assert.ok(encoding === undefined || encoding === 'zstd' || encoding === 'gzip', `unexpected content-encoding ${String(encoding)}`);
  return JSON.parse(plain.toString('utf8'));
}

function assertConsistent(row: Received): void {
  if (row.headers['content-length'] !== undefined) {
    assert.equal(Number(row.headers['content-length']), row.raw.length, 'content-length names the bytes sent');
    assert.equal(row.headers['transfer-encoding'], undefined);
  } else {
    assert.equal(row.headers['transfer-encoding'], 'chunked');
  }
  decode(row);
}

async function upstream(t: TestContext) {
  const received: Received[] = [];
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({ headers: req.headers, raw: Buffer.concat(chunks) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  return { received, port: (server.address() as AddressInfo).port };
}

async function fixture(t: TestContext) {
  const lb = await upstream(t);
  const openrouter = await upstream(t);
  const lbBase = `http://127.0.0.1:${lb.port}/backend-api/codex`;
  const orBase = `http://127.0.0.1:${openrouter.port}/api/v1`;
  const port = await selectAvailableDesktopBridgePort('127.0.0.1');
  const config: DesktopBridgeConfig = {
    listenHost: '127.0.0.1', listenPort: port,
    providerRegistry: { schema: 'sks.desktop-bridge-provider-registry.v1', generation: 'registry', created_at: '2026-10-28T00:00:00.000Z', providers: {
      'codex-lb': { provider_id: 'codex-lb', enabled: true, base_url: lbBase, allowed_origins: [new URL(lbBase).origin], auth_transport: 'x-codex-lb-api-key', credential_state: 'ready', credential_fingerprint: 'lb-fp', credential_generation: 'lb-credential', source_catalog_generation: 'lb-catalog' },
      openrouter: { provider_id: 'openrouter', enabled: true, base_url: orBase, allowed_origins: [new URL(orBase).origin], auth_transport: 'openrouter-bearer', credential_state: 'ready', credential_fingerprint: 'or-fp', credential_generation: 'or-credential', source_catalog_generation: 'or-catalog' },
    } },
    routePolicy: { schema: 'sks.bridge-routing-policy.v1', default_provider_id: 'codex-lb', fallback: 'none', model_routes: {
      'gpt-lb': { provider_id: 'codex-lb', upstream_model: 'gpt-lb' },
      'vendor/listed': { provider_id: 'openrouter', upstream_model: 'vendor/listed' },
    }, catalog_generation: 'catalog', policy_generation: 'policy', changed_at: '2026-10-28T00:00:00.000Z' },
    providerSessionPins: [],
    resolveProviderCredential: async (providerId, generation) => ({ provider_id: providerId, generation, value: `${providerId}-secret`, source: 'test', fingerprint: providerId === 'codex-lb' ? 'lb-fp' : 'or-fp' }),
    clientCapabilitySha256: createHash('sha256').update(CAPABILITY).digest('hex'),
    allowedPathPrefixes: ['/backend-api/codex/'], allowedOrigins: ['app://codex'], connectTimeoutMs: 2_000, idleTimeoutMs: 10_000,
  };
  const bridge = await startDesktopBridge(config, { writeState: false });
  t.after(() => bridge.stop());
  async function post(body: Buffer, headers: Record<string, string>): Promise<number> {
    return new Promise((resolve, reject) => {
      const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: desktopBridgeClientPath(CAPABILITY, '/backend-api/codex/responses'), headers: {
        'content-type': 'application/json', origin: 'app://codex', authorization: 'Bearer client-oauth', ...headers,
      } }, (response) => { response.resume(); response.once('end', () => resolve(response.statusCode || 0)); });
      request.once('error', reject);
      // Two writes, so a body without content-length really is sent chunked.
      request.write(body.subarray(0, 7));
      request.end(body.subarray(7));
    });
  }
  return { lb, openrouter, post };
}

const replay = (model: string) => Buffer.from(JSON.stringify({
  model, input: [{ type: 'message', role: 'user', content: [{ type: 'input_text', text: 'x'.repeat(4_000) }] }],
  include: ['reasoning.encrypted_content', 'output.encrypted_content'], stream_options: { include_obfuscation: false },
}));

test('a rewritten body travels with headers that describe its bytes, on every encoding and route', { timeout: 20_000 }, async (t) => {
  const f = await fixture(t);
  const cases: Array<{ name: string; model: string; encoding: 'zstd' | 'gzip'; chunked: boolean; expect: string | undefined }> = [
    { name: 'Codex-LB, zstd: re-compressed like the client', model: 'gpt-lb', encoding: 'zstd', chunked: false, expect: 'zstd' },
    { name: 'Codex-LB, zstd, chunked upload', model: 'gpt-lb', encoding: 'zstd', chunked: true, expect: 'zstd' },
    { name: 'Codex-LB, gzip: plain once rewritten', model: 'gpt-lb', encoding: 'gzip', chunked: false, expect: undefined },
    { name: 'OpenRouter, zstd: always plain', model: 'vendor/listed', encoding: 'zstd', chunked: false, expect: undefined },
  ];
  for (const row of cases) {
    if (row.encoding === 'zstd' && !zstd.zstdCompressSync) continue;
    const plain = replay(row.model);
    const body = row.encoding === 'zstd' ? zstd.zstdCompressSync!(plain) : zlib.gzipSync(plain);
    const headers: Record<string, string> = { 'content-encoding': row.encoding, ...(row.chunked ? {} : { 'content-length': String(body.length) }) };
    assert.equal(await f.post(body, headers), 200, row.name);
    const target = row.model === 'gpt-lb' ? f.lb : f.openrouter;
    const forwarded = target.received.at(-1)!;
    assertConsistent(forwarded);
    assert.equal(forwarded.headers['content-encoding'], row.expect, row.name);
    assert.deepEqual(decode(forwarded).include, ['reasoning.encrypted_content'], `${row.name}: the body was rewritten`);
  }
  assert.ok(f.lb.received.length + f.openrouter.received.length > 0);
});

test('an untouched compressed body travels exactly as the client sent it', { timeout: 20_000 }, async (t) => {
  if (!zstd.zstdCompressSync) { t.skip('zstd unavailable in this Node'); return; }
  const f = await fixture(t);
  const body = zstd.zstdCompressSync(Buffer.from(JSON.stringify({ model: 'gpt-lb', input: 'hi', include: ['reasoning.encrypted_content'] })));
  assert.equal(await f.post(body, { 'content-encoding': 'zstd', 'content-length': String(body.length) }), 200);
  const forwarded = f.lb.received[0]!;
  assertConsistent(forwarded);
  assert.equal(forwarded.headers['content-encoding'], 'zstd');
  assert.ok(forwarded.raw.equals(body));
});

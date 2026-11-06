import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { offeredUpdateVersion, versionDownloadability } from '../registry-availability.js';

const registry = 'https://registry.example.test/';
const env = { SKS_UPDATE_TARBALL_PROBE: '1' };

function registryFetch(state: { doc: number; tarball: number }) {
  const calls: string[] = [];
  const fetchImpl = (async (url: string | URL, init?: RequestInit) => {
    calls.push(`${init?.method || 'GET'} ${String(url)}`);
    if (String(url).endsWith('.tgz')) return new Response(null, { status: state.tarball });
    if (state.doc !== 200) return new Response('{}', { status: state.doc });
    return new Response(JSON.stringify({ dist: { tarball: 'https://registry.example.test/sneakoscope/-/sneakoscope-10.4.0.tgz' } }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, calls };
}

test('a listed version is offered only once npm serves its tarball', async () => {
  const base = { listed: '10.4.0', current: '10.3.6', registry, packageName: 'sneakoscope', env };

  const listedOnly = registryFetch({ doc: 404, tarball: 404 });
  assert.deepEqual(await offeredUpdateVersion({ ...base, fetchImpl: listedOnly.fetchImpl }), { latest: '10.3.6', pending: '10.4.0' });

  const docOnly = registryFetch({ doc: 200, tarball: 404 });
  assert.deepEqual(await offeredUpdateVersion({ ...base, fetchImpl: docOnly.fetchImpl }), { latest: '10.3.6', pending: '10.4.0' });
  assert.deepEqual(docOnly.calls, ['GET https://registry.example.test/sneakoscope/10.4.0', 'HEAD https://registry.example.test/sneakoscope/-/sneakoscope-10.4.0.tgz']);

  const served = registryFetch({ doc: 200, tarball: 200 });
  assert.deepEqual(await offeredUpdateVersion({ ...base, fetchImpl: served.fetchImpl }), { latest: '10.4.0', pending: null });
});

test('an unreachable registry or a non-newer version never hides or invents an update', async () => {
  const base = { current: '10.3.6', registry, packageName: 'sneakoscope', env };
  const offline = (async () => { throw new Error('ENOTFOUND'); }) as typeof fetch;
  assert.deepEqual(await offeredUpdateVersion({ ...base, listed: '10.4.0', fetchImpl: offline }), { latest: '10.4.0', pending: null });
  const neverCalled = (async () => { throw new Error('must not probe'); }) as typeof fetch;
  assert.deepEqual(await offeredUpdateVersion({ ...base, listed: '10.3.6', fetchImpl: neverCalled }), { latest: '10.3.6', pending: null });
  assert.deepEqual(await offeredUpdateVersion({ ...base, listed: '10.4.0', env: { SKS_UPDATE_TARBALL_PROBE: '0' }, fetchImpl: neverCalled }), { latest: '10.4.0', pending: null });
});

test('a stalled registry document body times out and a later probe can recover', { timeout: 15_000 }, async t => {
  let stall = true;
  let headersReceived = false;
  let headRequests = 0;
  const server = http.createServer((request, response) => {
    if (request.method === 'HEAD') {
      headRequests += 1;
      response.writeHead(200).end();
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    if (stall) {
      // Send headers and part of the JSON, but never complete the body.
      response.write('{"dist":');
    } else {
      response.end(JSON.stringify({ dist: { tarball: `${localRegistry}/package.tgz` } }));
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => {
    server.closeAllConnections();
    return new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const localRegistry = `http://127.0.0.1:${address.port}`;
  const fetchImpl: typeof fetch = async (url, init) => {
    const response = await fetch(url, init);
    if (init?.method !== 'HEAD') headersReceived = true;
    return response;
  };
  const options = { registry: localRegistry, packageName: 'sneakoscope', version: '10.4.0', env, fetchImpl, timeoutMs: 1_000 };
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      versionDownloadability(options),
      new Promise<never>((_, reject) => {
        watchdog = setTimeout(() => reject(new Error('registry body outlived the probe deadline')), 8_000);
      })
    ]);
    assert.equal(headersReceived, true, 'exercise body timeout after response headers arrived');
    assert.equal(result, 'unknown');
    assert.equal(headRequests, 0, 'an incomplete document cannot select a tarball');
  } finally {
    clearTimeout(watchdog);
  }
  stall = false;
  assert.equal(await versionDownloadability(options), 'downloadable');
  assert.equal(headRequests, 1);
});

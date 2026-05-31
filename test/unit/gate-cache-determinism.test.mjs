import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  gateCacheKey,
  readGateCache,
  writeGateCache,
  recordGateResult,
  lookupGateResult
} from '../../dist/core/release/gate-cache.js';

const KEY_INPUT = {
  gateId: 'demo:gate',
  command: 'npm run demo:gate',
  packageVersion: '1.20.2',
  gitCommit: 'abc123',
  inputHashes: ['src/a.ts:deadbeef', 'src/b.ts:cafebabe'],
  envMode: 'incremental',
  distHash: 'digest-1'
};

test('gateCacheKey is deterministic and order-insensitive on inputHashes', () => {
  const k1 = gateCacheKey(KEY_INPUT);
  const k2 = gateCacheKey({ ...KEY_INPUT, inputHashes: ['src/b.ts:cafebabe', 'src/a.ts:deadbeef'] });
  assert.equal(k1, k2);
});

test('changing an affected-file hash invalidates the key (cache miss)', () => {
  const k1 = gateCacheKey(KEY_INPUT);
  const k2 = gateCacheKey({ ...KEY_INPUT, inputHashes: ['src/a.ts:11111111', 'src/b.ts:cafebabe'] });
  assert.notEqual(k1, k2);
});

test('changing distHash or package version invalidates the key', () => {
  const base = gateCacheKey(KEY_INPUT);
  assert.notEqual(base, gateCacheKey({ ...KEY_INPUT, distHash: 'digest-2' }));
  assert.notEqual(base, gateCacheKey({ ...KEY_INPUT, packageVersion: '1.20.3' }));
});

test('recorded successful result is served as a hit on the same key (skip re-run)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-gate-cache-'));
  let cache = await readGateCache(root);
  const key = gateCacheKey(KEY_INPUT);
  assert.equal(lookupGateResult(cache, key), null); // miss before record

  cache = recordGateResult(cache, key, KEY_INPUT.gateId, true, 1234);
  await writeGateCache(root, cache);

  const reloaded = await readGateCache(root);
  const hit = lookupGateResult(reloaded, key);
  assert.ok(hit);
  assert.equal(hit.ok, true);
  assert.equal(hit.gate_id, 'demo:gate');
  assert.equal(hit.duration_ms, 1234); // budget consumer reads duration_ms/gate_id (schema v1)
});

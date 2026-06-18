import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const cacheMod = await importDist('core/triwiki/triwiki-cache-key.js');
const bankMod = await importDist('core/triwiki/triwiki-proof-bank.js');
const releaseCacheMod = await importDist('core/release/release-gate-cache-v2.js');
const key = cacheMod.computeTriWikiCacheKey({ root, id: 'release:cache-bridge', inputs: ['package.json', 'release-gates.v2.json'] });
const status = bankMod.summarizeTriWikiProofBank(root);
assertGate(Boolean(key.release_gates_hash) && status.schema === 'sks.triwiki-proof-bank.v1', 'cache bridge material must be readable', { key, status });
const fixtureGate = {
  id: 'release:cache-bridge',
  command: 'npm run release:cache-bridge --silent',
  deps: [],
  resource: ['cpu-light'],
  side_effect: 'hermetic',
  timeout_ms: 300000,
  cache: { enabled: true, inputs: ['package.json', 'release-gates.v2.json'] },
  isolation: { home: 'temp', codex_home: 'temp', report_dir: 'per-gate' },
  preset: ['release']
};
releaseCacheMod.writeReleaseGateCacheHit(root, fixtureGate, 7);
const hit = releaseCacheMod.readReleaseGateCacheRecord(root, fixtureGate);
assertGate(Boolean(hit) && hit.duration_ms === 7, 'release cache bridge must roundtrip through reusable TriWiki proof material', hit);
emitGate('release:cache-bridge', { cache_bridge_consistent: true, release_gates_hash: key.release_gates_hash, duration_ms: hit.duration_ms });

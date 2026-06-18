import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const cardMod = await importDist('core/triwiki/triwiki-proof-card.js');
const bankMod = await importDist('core/triwiki/triwiki-proof-bank.js');
const invalidationMod = await importDist('core/triwiki/triwiki-invalidation.js');
const card = cardMod.createTriWikiProofCard({
  subject_type: 'gate',
  subject_id: 'triwiki:stale-proof-rejection:fixture',
  cache_key: 'stale-proof-key',
  input_hash: 'input',
  gate_impl_hash: 'impl',
  package_lock_hash: 'pkg',
  release_gates_hash: 'gates',
  env_allowlist_hash: 'env',
  tool_versions: { sks: '4.0.1' },
  fixture_version: 'sks-4.0.1',
  result: 'passed',
  reusable: true,
  evidence: { fixture: true }
});
bankMod.writeTriWikiProofCard(root, card);
await invalidationMod.invalidateTriWikiProofsForChange({ root, changedFiles: ['package.json'], affectedModules: [], affectedGates: [card.subject_id], reason: 'blackbox' });
const hit = bankMod.readReusableTriWikiProofCard({ root, subjectId: card.subject_id, cacheKey: card.cache_key });
assertGate(hit.hit === false, 'invalidated proof must not be reusable', hit);
emitGate('triwiki:stale-proof-rejection', { rejected: true, reasons: hit.invalidation_reasons });

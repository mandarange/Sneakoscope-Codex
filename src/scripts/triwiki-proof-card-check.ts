// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/triwiki/triwiki-proof-card.js');
const card = mod.createTriWikiProofCard({
  subject_type: 'gate',
  subject_id: 'triwiki:proof-card',
  cache_key: 'cache-key',
  input_hash: 'input',
  implementation_hash: 'impl',
  tool_version: '4.0.0',
  fixture_version: 'sks-4.0.0',
  result: 'passed',
  reusable: true,
  evidence: { fixture: true }
});
assertGate(card.schema === 'sks.triwiki-proof-card.v1', 'proof card schema mismatch', card);
assertGate(card.proof_id.startsWith('proof-') && mod.isReusableTriWikiProofCard(card), 'proof card must be reusable when passed', card);
emitGate('triwiki:proof-card', { proof_id: card.proof_id });

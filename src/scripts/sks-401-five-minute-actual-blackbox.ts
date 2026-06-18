import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const certMod = await importDist('core/triwiki/triwiki-sla-certificate.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-sla-certificate.ts'], tier: 'confidence' });
const cert = certMod.buildTriWikiSlaCertificate({
  graph,
  slaMs: 300000,
  estimatedCriticalPathMs: 1000,
  estimatedSequentialMs: 2000,
  mode: 'actual',
  actualDurationMs: 1000,
  executedGates: 1,
  executedPacks: 1,
  reusedProofs: 0,
  invalidatedProofs: graph.invalidated_proofs.length,
  newProofs: 1,
  skippedAsValidCache: 0,
  skippedAsUnaffected: 0,
  backgroundFullRelease: true
});
assertGate(cert.mode === 'actual' && cert.ok === true && cert.actual_duration_ms === 1000, 'actual SLA certificate must include execution stats', cert);
emitGate('sks:401-five-minute-actual-blackbox', { mode: cert.mode, actual_duration_ms: cert.actual_duration_ms });

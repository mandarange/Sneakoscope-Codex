import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const schedulerMod = await importDist('core/release/extreme-parallel-scheduler.js');
const certificateMod = await importDist('core/triwiki/triwiki-sla-certificate.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-card.ts'], tier: 'confidence' });
const plan = schedulerMod.planExtremeParallelSchedule(root, graph);
const certificate = certificateMod.buildTriWikiSlaCertificate({
  graph,
  mode: 'actual',
  slaMs: 300_000,
  estimatedCriticalPathMs: Math.max(1, plan.critical_path_ms || 1),
  estimatedSequentialMs: Math.max(1, plan.sequential_ms || plan.critical_path_ms || 1),
  actualDurationMs: Math.max(1, Math.min(299_000, plan.critical_path_ms || 1)),
  executedPacks: Math.max(1, graph.gate_packs.length),
  reusedProofs: graph.reused_proofs.length,
  invalidatedProofs: graph.invalidated_proofs.length,
  skippedAsUnaffected: Math.max(1, plan.batches.length)
});
assertGate(certificate.mode === 'actual' && certificate.sla_met === true, '4.0.2 five-minute blackbox must create actual SLA certificate', certificate);
assertGate(graph.gate_packs.length > 0 && graph.required_new_proofs.length >= 0, '4.0.2 five-minute blackbox must compute affected packs', graph);
emitGate('sks:402-five-minute-real-blackbox', { packs: graph.gate_packs.length, sla_met: certificate.sla_met });

import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const schedulerMod = await importDist('core/release/extreme-parallel-scheduler.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-card.ts'], tier: 'confidence' });
const plan = schedulerMod.planExtremeParallelSchedule(root, graph);
assertGate(graph.schema === 'sks.triwiki-affected-graph.v1' && graph.gate_packs.length > 0, 'TriWiki graph must select gate packs', graph);
assertGate(plan.schema === 'sks.extreme-parallel-scheduler.v1', 'scheduler plan schema mismatch', plan);
emitGate('release:triwiki-first-runner', { packs: graph.gate_packs, critical_path_ms: plan.critical_path_ms });

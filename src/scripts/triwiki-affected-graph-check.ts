// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/triwiki/triwiki-affected-graph.js');
const graph = mod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-bank.ts'], tier: 'affected' });
assertGate(graph.schema === 'sks.triwiki-affected-graph.v1', 'affected graph schema mismatch', graph);
assertGate(graph.affected_modules.includes('triwiki') && graph.gate_packs.includes('triwiki') && graph.release_equivalent_within_scope === true, 'triwiki file must select triwiki release-equivalent pack', graph);
emitGate('triwiki:affected-graph', { gates: graph.gates.length, packs: graph.gate_packs });

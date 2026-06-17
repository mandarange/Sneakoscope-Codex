// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const sla = await importDist('core/release/sla-scheduler.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-bank.ts'], tier: 'affected' });
const plan = sla.planFiveMinuteSla(root, graph);
assertGate(plan.certificate.sla_ms === 300000 && plan.graph.release_equivalent_within_scope === true, 'five-minute TriWiki blackbox must produce release-equivalent certificate', plan);
emitGate('pipeline:five-minute-triwiki-blackbox', { gates: plan.graph.gates.length, ok: plan.ok });

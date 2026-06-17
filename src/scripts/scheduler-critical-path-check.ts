// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const scheduler = await importDist('core/release/extreme-parallel-scheduler.js');
const graphMod = await importDist('core/triwiki/triwiki-affected-graph.js');
const graph = graphMod.computeTriWikiAffectedGraph({ root, changedFiles: ['src/core/triwiki/triwiki-proof-bank.ts'], tier: 'affected' });
const schedule = scheduler.planExtremeParallelSchedule(root, graph);
assertGate(schedule.critical_path_ms <= schedule.sequential_ms, 'critical path cannot exceed sequential estimate', schedule);
emitGate('scheduler:critical-path', { critical_path_ms: schedule.critical_path_ms, sequential_ms: schedule.sequential_ms });

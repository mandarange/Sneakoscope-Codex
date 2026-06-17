import { buildGatePackManifest } from './gate-pack-manifest.js';
import type { ResourceClassBudget } from './resource-class-budget.js';
import { computeResourceClassBudget } from './resource-class-budget.js';
import type { TriWikiAffectedGraph } from '../triwiki/triwiki-affected-graph.js';

export const EXTREME_PARALLEL_SCHEDULER_SCHEMA = 'sks.extreme-parallel-scheduler.v1';

export interface ExtremeParallelSchedule {
  schema: typeof EXTREME_PARALLEL_SCHEDULER_SCHEMA;
  ok: boolean;
  batches: Array<{ batch: number; packs: string[]; estimated_ms: number }>;
  sequential_ms: number;
  critical_path_ms: number;
  reduction_ratio: number;
  budget: ResourceClassBudget;
  blockers: string[];
}

export function planExtremeParallelSchedule(root: string, graph?: TriWikiAffectedGraph, budget: ResourceClassBudget = computeResourceClassBudget()): ExtremeParallelSchedule {
  const manifest = buildGatePackManifest(root);
  const selectedIds = new Set(graph?.gate_packs && graph.gate_packs.length ? graph.gate_packs : manifest.packs.map((pack) => pack.id));
  const packs = manifest.packs.filter((pack) => selectedIds.has(pack.id)).sort((a, b) => b.estimated_ms - a.estimated_ms);
  const laneCount = Math.max(1, Math.min(packs.length || 1, Math.max(4, budget.cpu_light)));
  const lanes: Array<{ packs: string[]; estimated_ms: number }> = Array.from({ length: laneCount }, () => ({ packs: [], estimated_ms: 0 }));
  for (const pack of packs) {
    const target = lanes.reduce((best, lane) => lane.estimated_ms < best.estimated_ms ? lane : best, lanes[0]!);
    target.packs.push(pack.id);
    target.estimated_ms += pack.estimated_ms;
  }
  const batches = lanes
    .filter((lane) => lane.packs.length > 0)
    .map((lane, index) => ({ batch: index + 1, packs: lane.packs, estimated_ms: lane.estimated_ms }));
  const sequential = packs.reduce((sum, pack) => sum + pack.estimated_ms, 0);
  const critical = batches.reduce((max, batch) => Math.max(max, batch.estimated_ms), 0);
  const ratio = sequential <= 0 ? 1 : critical / sequential;
  const blockers = ratio <= 0.3 || packs.length <= 1 ? [] : ['critical_path_reduction_below_70_percent'];
  return {
    schema: EXTREME_PARALLEL_SCHEDULER_SCHEMA,
    ok: blockers.length === 0,
    batches,
    sequential_ms: sequential,
    critical_path_ms: critical,
    reduction_ratio: Number(ratio.toFixed(4)),
    budget,
    blockers
  };
}

import { buildGatePackManifest } from './gate-pack-manifest.js';
import { executeGatePack, type GatePackRunnerResult } from './gate-pack-runner.js';
import { buildCriticalPathLedger, writeCriticalPathLedger } from './critical-path-ledger.js';
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

export interface ExtremeSchedulerRunReport extends ExtremeParallelSchedule {
  run_id: string;
  mode: 'execute';
  executed_packs: string[];
  reused_proof_count: number;
  executed_gate_count: number;
  failed_pack_count: number;
  wall_ms: number;
  pack_reports: GatePackRunnerResult[];
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

export async function executeExtremeSchedule(input: {
  root: string;
  graph: TriWikiAffectedGraph;
  slaMs: number;
  budget: ResourceClassBudget;
  useProofBank: boolean;
}): Promise<ExtremeSchedulerRunReport> {
  const planned = planExtremeParallelSchedule(input.root, input.graph, input.budget);
  const started = Date.now();
  const runId = `xs-${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`;
  const reports: GatePackRunnerResult[] = [];
  let reused = 0;
  let executedGates = 0;
  let failedPacks = 0;
  for (const batch of planned.batches) {
    const results = await Promise.all(batch.packs.map((packId) => executeGatePack({
      root: input.root,
      packId,
      mode: 'execute',
      maxParallel: Math.max(1, Math.min(4, input.budget.cpu_light))
    })));
    for (const report of results) {
      reports.push(report);
      reused += report.reused_proof_count || report.reused || 0;
      executedGates += report.executed_gate_count || report.executed || 0;
      if (!report.ok) failedPacks += 1;
    }
  }
  const wallMs = Math.max(0, Date.now() - started);
  const criticalPathMs = reports.reduce((max, report) => Math.max(max, report.critical_path_ms || 0), planned.critical_path_ms);
  const sequentialMs = reports.reduce((sum, report) => sum + (report.critical_path_ms || 0), planned.sequential_ms);
  writeCriticalPathLedger(input.root, buildCriticalPathLedger({
    run_id: runId,
    sequential_ms: sequentialMs,
    critical_path_ms: criticalPathMs,
    wall_ms: wallMs,
    parallelism_gain: wallMs > 0 ? Number((sequentialMs / wallMs).toFixed(2)) : 1,
    resource_wait_ms: {},
    top_blockers: reports.filter((report) => !report.ok).map((report) => ({ id: report.pack_id, wait_ms: 0, run_ms: report.critical_path_ms || 0 }))
  }));
  return {
    ...planned,
    ok: planned.ok && failedPacks === 0 && wallMs <= input.slaMs,
    run_id: runId,
    mode: 'execute',
    executed_packs: reports.map((report) => report.pack_id),
    reused_proof_count: reused,
    executed_gate_count: executedGates,
    failed_pack_count: failedPacks,
    wall_ms: wallMs,
    critical_path_ms: criticalPathMs,
    sequential_ms: sequentialMs,
    pack_reports: reports,
    blockers: [...planned.blockers, ...(wallMs > input.slaMs ? ['sla_actual_exceeds_budget'] : []), ...(failedPacks ? ['pack_execution_failed'] : [])]
  };
}

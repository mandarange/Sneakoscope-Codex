import { computeTriWikiAffectedGraph, type TriWikiAffectedGraph } from '../triwiki/triwiki-affected-graph.js';
import { buildTriWikiSlaCertificate, type TriWikiSlaCertificate } from '../triwiki/triwiki-sla-certificate.js';
import { planExtremeParallelSchedule } from './extreme-parallel-scheduler.js';

export const SLA_SCHEDULER_SCHEMA = 'sks.sla-scheduler.v1';

export interface SlaSchedulerPlan {
  schema: typeof SLA_SCHEDULER_SCHEMA;
  ok: boolean;
  graph: TriWikiAffectedGraph;
  certificate: TriWikiSlaCertificate;
  highest_confidence_subset: string[];
}

export function planFiveMinuteSla(root: string, graph: TriWikiAffectedGraph = computeTriWikiAffectedGraph({ root, tier: 'affected', includeProofLookup: false }), slaMs = 300_000): SlaSchedulerPlan {
  const schedule = planExtremeParallelSchedule(root, graph);
  const certificate = buildTriWikiSlaCertificate({
    graph,
    slaMs,
    estimatedCriticalPathMs: schedule.critical_path_ms,
    estimatedSequentialMs: schedule.sequential_ms,
    blockers: [...schedule.blockers]
  });
  return {
    schema: SLA_SCHEDULER_SCHEMA,
    ok: certificate.ok,
    graph,
    certificate,
    highest_confidence_subset: certificate.ok ? graph.gates : graph.gates.slice(0, Math.max(1, Math.floor(graph.gates.length / 2)))
  };
}

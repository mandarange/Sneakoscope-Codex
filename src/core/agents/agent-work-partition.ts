import { collectRepoInventory } from './work-partition/repo-inventory.js'
import { buildDependencyGraph } from './work-partition/dependency-graph.js'
import { buildSemanticDomainGraph } from './work-partition/semantic-domain-graph.js'
import { createAgentTaskSlices } from './work-partition/task-slicer.js'
import { planAgentLeases } from './work-partition/lease-planner.js'
import { detectAgentLeaseConflicts } from './work-partition/conflict-detector.js'
import { buildNoOverlapProof } from './work-partition/no-overlap-proof.js'
import { buildAgentTaskGraph } from './agent-task-graph.js'
import { buildIntelligentWorkGraph, enhanceTaskGraphWithIntelligence } from './intelligent-work-graph.js'

export async function buildAgentWorkPartition(root: string, roster: any, prompt = '', opts: {
  route?: string
  targetActiveSlots?: number
  desiredWorkItemCount?: number
  minimumWorkItems?: number
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  strategyRefs?: Record<string, unknown> | null
  microWins?: Array<{ id: string; title?: string; description?: string; kind?: string; write_paths?: string[]; readonly_paths?: string[]; dependencies?: string[]; dopamine_weight?: number; appshot_required?: boolean }>
} = {}) {
  const inventory = await collectRepoInventory(root)
  const dependency_graph = buildDependencyGraph(inventory)
  const semantic_domain_graph = buildSemanticDomainGraph(inventory)
  const sessions = Object.fromEntries((roster.roster || []).map((agent: any) => [agent.id, agent.session_id]))
  const targetActiveSlots = Number(opts.targetActiveSlots || roster.agent_count || roster.concurrency || 5)
  const intelligent_work_graph = await buildIntelligentWorkGraph({
    root,
    inventory,
    dependencyGraph: dependency_graph,
    route: opts.route || '$Agent',
    prompt
  })
  const task_graph = enhanceTaskGraphWithIntelligence(buildAgentTaskGraph({
    routeType: opts.route || '$Agent',
    prompt,
    targetActiveSlots,
    ...(opts.minimumWorkItems === undefined ? {} : { minimumWorkItems: opts.minimumWorkItems }),
    ...(opts.desiredWorkItemCount === undefined ? {} : { desiredWorkItems: opts.desiredWorkItemCount }),
    domains: semantic_domain_graph.domains,
    sourceIntelligenceRefs: opts.sourceIntelligenceRefs || null,
    goalModeRef: opts.goalModeRef || null,
    strategyRefs: opts.strategyRefs || null,
    ...(opts.microWins === undefined ? {} : { microWins: opts.microWins })
  }), intelligent_work_graph)
  const slices = createAgentTaskSlices({
    roster: roster.roster || [],
    domains: semantic_domain_graph.domains,
    prompt,
    routeWorkGraph: task_graph,
    ...(opts.desiredWorkItemCount === undefined ? {} : { desiredWorkItemCount: opts.desiredWorkItemCount }),
    ...(opts.minimumWorkItems === undefined ? {} : { minimumWorkItems: opts.minimumWorkItems })
  })
  const leases = planAgentLeases(slices, sessions)
  const conflict_report = detectAgentLeaseConflicts(leases)
  const no_overlap_proof = buildNoOverlapProof(leases)
  return {
    schema: 'sks.agent-work-partition.v1',
    ok: conflict_report.ok && no_overlap_proof.ok,
    inventory,
    dependency_graph,
    semantic_domain_graph,
    intelligent_work_graph,
    task_graph,
    route_work_count_summary: task_graph.route_work_count_summary,
    slices,
    leases,
    conflict_report,
    no_overlap_proof,
    blockers: [...conflict_report.blockers, ...no_overlap_proof.blockers]
  }
}

import { collectRepoInventory } from './work-partition/repo-inventory.js'
import { buildDependencyGraph } from './work-partition/dependency-graph.js'
import { buildSemanticDomainGraph } from './work-partition/semantic-domain-graph.js'
import { createAgentTaskSlices } from './work-partition/task-slicer.js'
import { planAgentLeases } from './work-partition/lease-planner.js'
import { detectAgentLeaseConflicts } from './work-partition/conflict-detector.js'
import { buildNoOverlapProof } from './work-partition/no-overlap-proof.js'
import { buildAgentTaskGraph } from './agent-task-graph.js'
import { buildIntelligentWorkGraph, enhanceTaskGraphWithIntelligence } from './intelligent-work-graph.js'
import { HARD_AGENT_CONCURRENCY } from './agent-schema.js'

const DEFAULT_ACTIVE_SLOTS = 4

export async function buildAgentWorkPartition(root: string, roster: any, prompt = '', opts: {
  route?: string
  targetActiveSlots?: number
  desiredWorkItemCount?: number
  minimumWorkItems?: number
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  strategyRefs?: Record<string, unknown> | null
  strategyOwnershipPlan?: { owners?: any[] } | null
  microWins?: Array<{ id: string; title?: string; description?: string; kind?: string; write_paths?: string[]; readonly_paths?: string[]; dependencies?: string[]; dopamine_weight?: number; appshot_required?: boolean }>
} = {}) {
  const inventory = await collectRepoInventory(root)
  const dependency_graph = buildDependencyGraph(inventory)
  const semantic_domain_graph = buildSemanticDomainGraph(inventory)
  const sessions = Object.fromEntries((roster.roster || []).map((agent: any) => [agent.id, agent.session_id]))
  const requestedSlots = Math.floor(Number(opts.targetActiveSlots || roster.concurrency || roster.agent_count || DEFAULT_ACTIVE_SLOTS))
  const targetActiveSlots = Math.max(1, Math.min(
    HARD_AGENT_CONCURRENCY,
    Number.isFinite(requestedSlots) && requestedSlots >= 1 ? requestedSlots : DEFAULT_ACTIVE_SLOTS
  ))
  const intelligent_work_graph = await buildIntelligentWorkGraph({
    root,
    inventory,
    dependencyGraph: dependency_graph,
    route: opts.route || '$Naruto',
    prompt
  })
  const task_graph = enhanceTaskGraphWithIntelligence(buildAgentTaskGraph({
    routeType: opts.route || '$Naruto',
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
  const slices = enrichSlicesWithStrategyOwnership(createAgentTaskSlices({
    roster: roster.roster || [],
    domains: semantic_domain_graph.domains,
    prompt,
    routeWorkGraph: task_graph,
    ...(opts.desiredWorkItemCount === undefined ? {} : { desiredWorkItemCount: opts.desiredWorkItemCount }),
    ...(opts.minimumWorkItems === undefined ? {} : { minimumWorkItems: opts.minimumWorkItems })
  }), opts.strategyOwnershipPlan || null)
  const leases = planAgentLeases(slices, sessions, opts.strategyOwnershipPlan || null)
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

function enrichSlicesWithStrategyOwnership(slices: any[], strategyOwnershipPlan: { owners?: any[] } | null) {
  if (!strategyOwnershipPlan?.owners?.length) return slices
  const byWritePath = new Map<string, any>()
  const byWriteTask = new Map<string, any>()
  for (const owner of strategyOwnershipPlan.owners) {
    if (owner?.access !== 'write') continue
    byWritePath.set(normalizePath(owner.path), owner)
    byWriteTask.set(String(owner.micro_win_id || owner.task_id || ''), owner)
  }
  return slices.map((slice) => {
    const owner = (slice.write_paths || []).map((file: string) => byWritePath.get(normalizePath(file))).find(Boolean)
      || byWriteTask.get(String(slice.micro_win_id || ''))
    if (!owner) return slice
    return {
      ...slice,
      verification_node_id: owner.verification_node_id || slice.verification_node_id || null,
      rollback_node_id: owner.rollback_node_id || slice.rollback_node_id || null
    }
  })
}

function normalizePath(file: string) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '')
}

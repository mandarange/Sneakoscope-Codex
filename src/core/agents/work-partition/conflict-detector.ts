import type { AgentLease } from '../agent-schema.js'
import { validateAgentLeases } from '../agent-lease.js'
import { buildAgentConflictGraph } from '../agent-conflict-graph.js'

export function detectAgentLeaseConflicts(leases: AgentLease[]) {
  const validation = validateAgentLeases(leases)
  const graph = buildAgentConflictGraph(leases)
  return {
    schema: 'sks.agent-lease-conflict-report.v1',
    ok: validation.ok && graph.ok,
    blockers: [...validation.blockers, ...graph.blockers],
    graph
  }
}


import type { AgentLease } from '../agent-schema.js'
import { validateAgentLeases } from '../agent-lease.js'

export function buildNoOverlapProof(leases: AgentLease[]) {
  const validation = validateAgentLeases(leases)
  return {
    schema: 'sks.agent-no-overlap-proof.v1',
    ok: validation.ok,
    write_lease_count: leases.filter((lease) => lease.kind === 'write').length,
    read_lease_count: leases.filter((lease) => lease.kind === 'read').length,
    blockers: validation.blockers,
    rule: 'No two agents can own the same exact file or overlapping subtree for write.'
  }
}


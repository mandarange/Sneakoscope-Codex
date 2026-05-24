import { validateAgentLeases } from '../agent-lease.mjs';
export function buildNoOverlapProof(leases) {
    const validation = validateAgentLeases(leases);
    return {
        schema: 'sks.agent-no-overlap-proof.v1',
        ok: validation.ok,
        write_lease_count: leases.filter((lease) => lease.kind === 'write').length,
        read_lease_count: leases.filter((lease) => lease.kind === 'read').length,
        blockers: validation.blockers,
        dependency_collision_risk: validation.blockers.filter((blocker) => blocker.startsWith('write_overlap:')),
        rule: 'No two agents can own the same exact file or overlapping subtree for write.'
    };
}
//# sourceMappingURL=no-overlap-proof.js.map
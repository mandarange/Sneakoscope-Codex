import { validateAgentLeases } from '../agent-lease.mjs';
import { buildAgentConflictGraph } from '../agent-conflict-graph.mjs';
export function detectAgentLeaseConflicts(leases) {
    const validation = validateAgentLeases(leases);
    const graph = buildAgentConflictGraph(leases);
    return {
        schema: 'sks.agent-lease-conflict-report.v1',
        ok: validation.ok && graph.ok,
        blockers: [...validation.blockers, ...graph.blockers],
        graph
    };
}
//# sourceMappingURL=conflict-detector.js.map
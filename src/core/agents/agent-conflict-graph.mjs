import { pathOverlaps } from './agent-lease.mjs';
export function buildAgentConflictGraph(leases) {
    const conflicts = [];
    const writeLeases = leases.filter((lease) => lease.kind === 'write' && lease.status !== 'released');
    for (let i = 0; i < writeLeases.length; i += 1) {
        for (let j = i + 1; j < writeLeases.length; j += 1) {
            const a = writeLeases[i];
            const b = writeLeases[j];
            if (a && b && a.agent_id !== b.agent_id && pathOverlaps(a.path, b.path)) {
                conflicts.push({ a: a.id, b: b.id, path_a: a.path, path_b: b.path, reason: 'overlapping_write_lease' });
            }
        }
    }
    return {
        schema: 'sks.agent-conflict-graph.v1',
        ok: conflicts.length === 0,
        nodes: leases.map((lease) => ({ id: lease.id, agent_id: lease.agent_id, kind: lease.kind, path: lease.path })),
        conflicts,
        blockers: conflicts.map((conflict) => conflict.reason + ':' + conflict.path_a + ':' + conflict.path_b)
    };
}
//# sourceMappingURL=agent-conflict-graph.js.map
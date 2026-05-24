const PROTECTED_WRITE_RE = /^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/;
export function normalizeLeasePath(input) {
    return String(input || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '') || '.';
}
export function pathOverlaps(a, b) {
    const left = normalizeLeasePath(a);
    const right = normalizeLeasePath(b);
    return left === right || left.startsWith(right + '/') || right.startsWith(left + '/');
}
export function validateAgentLeases(leases) {
    const blockers = [];
    const writeLeases = leases.filter((lease) => lease.kind === 'write' && lease.status !== 'released');
    for (const lease of writeLeases) {
        if (PROTECTED_WRITE_RE.test(normalizeLeasePath(lease.path)))
            blockers.push('protected_write:' + lease.path);
    }
    for (let i = 0; i < writeLeases.length; i += 1) {
        for (let j = i + 1; j < writeLeases.length; j += 1) {
            const a = writeLeases[i];
            const b = writeLeases[j];
            if (a && b && a.agent_id !== b.agent_id && pathOverlaps(a.path, b.path))
                blockers.push('write_overlap:' + a.agent_id + ':' + a.path + ':' + b.agent_id + ':' + b.path);
        }
    }
    return { ok: blockers.length === 0, blockers };
}
export function createAgentLease(input) {
    const leasePath = normalizeLeasePath(input.path);
    const lease = {
        id: input.kind + ':' + input.agent_id + ':' + leasePath,
        agent_id: input.agent_id,
        kind: input.kind,
        path: leasePath,
        status: input.status || 'active'
    };
    if (input.session_id !== undefined)
        lease.session_id = input.session_id;
    if (input.domain !== undefined)
        lease.domain = input.domain;
    return lease;
}
//# sourceMappingURL=agent-lease.js.map
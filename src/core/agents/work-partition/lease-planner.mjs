import { createAgentLease } from '../agent-lease.mjs';
export function planAgentLeases(slices, sessions = {}) {
    return slices.flatMap((slice) => {
        const sessionId = sessions[slice.owner_agent_id];
        const base = (kind, file) => ({
            agent_id: slice.owner_agent_id,
            ...(sessionId !== undefined ? { session_id: sessionId } : {}),
            kind,
            path: file,
            domain: slice.domain
        });
        return [
            ...slice.write_paths.map((file) => createAgentLease(base('write', file))),
            ...slice.readonly_paths.map((file) => createAgentLease(base('read', file)))
        ];
    });
}
//# sourceMappingURL=lease-planner.js.map
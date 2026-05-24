export function createAgentTaskSlices(input) {
    const domains = (input.domains?.length ? [...input.domains] : [{ id: 'general', files: [], criticality: 0 }]).sort((a, b) => Number(b.criticality || 0) - Number(a.criticality || 0));
    const leasedWrites = new Set();
    return input.roster.map((agent, index) => {
        const domain = selectDomainForAgent(agent, index, domains);
        const writeAllowed = /implementer|integrator|documentation|schema|release|ux/.test(agent.role);
        const targetPaths = Array.isArray(domain.files) ? domain.files.slice(0, 20) : [];
        const writePaths = [];
        if (writeAllowed) {
            for (const file of targetPaths) {
                const normalized = normalizeWritePath(file);
                if (!normalized || isProtectedWritePath(normalized) || leasedWrites.has(normalized))
                    continue;
                leasedWrites.add(normalized);
                writePaths.push(normalized);
                if (writePaths.length >= 3)
                    break;
            }
        }
        return {
            id: 'slice-' + String(index + 1).padStart(2, '0'),
            owner_agent_id: agent.id,
            role: agent.role,
            domain: domain.id || 'general',
            target_paths: targetPaths,
            readonly_paths: targetPaths,
            write_paths: writePaths,
            description: 'Native agent ' + agent.id + ' owns ' + (domain.id || 'general') + ' by domain criticality/dependency routing' + (writeAllowed ? ' with leased writes only.' : ' as read-only review.')
        };
    });
}
function normalizeWritePath(file) {
    return String(file || '').replace(/\\/g, '/').replace(/^\.?\//, '').replace(/\/+$/, '');
}
function isProtectedWritePath(file) {
    return /^(?:\.codex|\.agents|AGENTS\.md|node_modules\/sneakoscope|\.sneakoscope\/.*policy.*\.json)(?:\/|$)/.test(file);
}
function selectDomainForAgent(agent, index, domains) {
    const role = String(agent.role || '');
    const preferred = role.includes('safety') ? /qa|release|agent-kernel/ : role.includes('verifier') ? /qa|release|schemas/ : role.includes('integrator') ? /agent-kernel|team-route/ : role.includes('documentation') ? /docs/ : null;
    if (preferred) {
        const found = domains.find((domain) => preferred.test(String(domain.id || '')));
        if (found)
            return found;
    }
    return domains[index % domains.length] || { id: 'general', files: [] };
}
//# sourceMappingURL=task-slicer.js.map
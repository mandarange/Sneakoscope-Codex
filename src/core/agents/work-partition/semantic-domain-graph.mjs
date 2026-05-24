export function buildSemanticDomainGraph(inventory = {}) {
    const files = inventory.files || [];
    const domains = [
        domain('agent-kernel', /agent|orchestrat|worker|ledger|lease|persona|roster/i, files, 100),
        domain('team-route', /team|tmux|runtime-task|reviewer|executor/i, files, 95),
        domain('research-route', /research|autoresearch|source-ledger|debate/i, files, 95),
        domain('qa-review', /qa|review|computer-use|image-ux/i, files, 90),
        domain('release', /version|release|package|changelog|Cargo|sizecheck/i, files, 85),
        domain('schemas', /^schemas\//i, files, 80),
        domain('docs', /^docs\/|README|CHANGELOG/i, files, 45)
    ].filter((entry) => entry.files.length);
    return {
        schema: 'sks.agent-semantic-domain-graph.v1',
        route_domain_ownership: true,
        domains,
        route_domains: domains.filter((entry) => /route|qa/.test(entry.id)).map((entry) => entry.id),
        ui_ux_domains: domains.filter((entry) => /qa-review/.test(entry.id)).map((entry) => entry.id),
        db_domains: files.some((file) => /db|migration|supabase/i.test(file)) ? ['db-safety'] : [],
        release_ci_domains: ['release']
    };
}
function domain(id, re, files, criticality) {
    return { id, criticality, files: files.filter((file) => re.test(file)).slice(0, 200) };
}
//# sourceMappingURL=semantic-domain-graph.js.map
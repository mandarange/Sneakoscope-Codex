export function buildSemanticDomainGraph(inventory: any = {}) {
  const files: string[] = inventory.files || []
  const domains = [
    domain('agent-kernel', /agent|orchestrat|worker|ledger|lease|persona|roster/i, files),
    domain('team-route', /team|tmux|runtime-task|reviewer|executor/i, files),
    domain('research-route', /research|autoresearch|source-ledger|debate/i, files),
    domain('qa-review', /qa|review|computer-use|image-ux/i, files),
    domain('release', /version|release|package|changelog|Cargo|sizecheck/i, files),
    domain('docs', /^docs\/|README|CHANGELOG/i, files),
    domain('schemas', /^schemas\//i, files)
  ]
  return {
    schema: 'sks.agent-semantic-domain-graph.v1',
    domains,
    route_domains: domains.filter((entry) => /route|qa/.test(entry.id)).map((entry) => entry.id),
    ui_ux_domains: domains.filter((entry) => /qa-review/.test(entry.id)).map((entry) => entry.id),
    db_domains: files.some((file) => /db|migration|supabase/i.test(file)) ? ['db-safety'] : [],
    release_ci_domains: ['release']
  }
}

function domain(id: string, re: RegExp, files: string[]) {
  return { id, files: files.filter((file) => re.test(file)).slice(0, 100) }
}


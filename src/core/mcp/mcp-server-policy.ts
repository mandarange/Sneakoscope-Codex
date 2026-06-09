export interface McpPluginServerCandidate {
  name: string
  plugin_id: string
  url: string | null
  auth_type: string | null
  candidate_only: true
  auto_enable: false
  destructive_tools_auto_enabled: false
  db_safety_required: boolean
  mad_db_required_for_destructive: boolean
  oauth_prerefresh_recommended: boolean
  policy_notes: string[]
}

export function policyForPluginMcpServer(input: { pluginId: string; name: string; url?: string | null; authType?: string | null }): McpPluginServerCandidate {
  const haystack = `${input.name} ${input.url || ''}`.toLowerCase()
  const dbRelated = /supabase|postgres|database|sql|db\b/.test(haystack)
  const oauth = /oauth/i.test(String(input.authType || ''))
  return {
    name: input.name,
    plugin_id: input.pluginId,
    url: input.url || null,
    auth_type: input.authType || null,
    candidate_only: true,
    auto_enable: false,
    destructive_tools_auto_enabled: false,
    db_safety_required: dbRelated,
    mad_db_required_for_destructive: dbRelated,
    oauth_prerefresh_recommended: oauth,
    policy_notes: [
      'Remote MCP servers from plugin detail are candidate only.',
      'Do not auto-enable destructive MCP tools.',
      dbRelated ? 'DB MCP servers require DB safety and Mad-DB for destructive operations.' : 'Non-DB MCP candidate still requires explicit operator enablement.',
      oauth ? 'OAuth-backed MCP should trigger pre-refresh doctor check.' : ''
    ].filter(Boolean)
  }
}

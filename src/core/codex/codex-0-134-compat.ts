import { runProcess, which } from '../fsx.js'
import { compareSemverLike, parseCodexVersionText } from '../codex-compat/codex-version-policy.js'
import { detectManagedProxyEnv } from './managed-proxy-env.js'

export const CODEX_0_134_BASELINE_TAG = 'rust-v0.134.0'
export const CODEX_0_134_VERSION = '0.134.0'
export const CODEX_0_134_SCHEMA = 'sks.codex-0.134-matrix.v1'

export type Codex0134CapabilityId =
  | 'local_conversation_history_search'
  | 'profile_primary_selector'
  | 'mcp_per_server_environment'
  | 'mcp_streamable_http_oauth'
  | 'connector_schema_refs_defs_compaction'
  | 'mcp_readonly_parallel_hint'
  | 'hook_subagent_context'
  | 'managed_network_proxy_env'
  | 'workspace_usage_limit_messages'
  | 'remote_reliability_retries'

export interface Codex0134Capability {
  id: Codex0134CapabilityId
  priority: 'P0' | 'P1' | 'P2'
  status: 'available' | 'integration_optional' | 'degraded_supported' | 'warning_only'
  preferred?: boolean
  detector: string
  notes: string[]
}

export interface Codex0134LocalEvidence {
  available: boolean
  versionText: string
  execHelp: string
  mcpHelp: string
  historyHelp: string
  historyCommandAvailable: boolean
  schemaPolicyText: string
  warnings: string[]
}

export const CODEX_0_134_RELEASE_EVIDENCE = Object.freeze({
  upstream: 'openai/codex',
  tag: CODEX_0_134_BASELINE_TAG,
  tag_url: 'https://github.com/openai/codex/releases/tag/rust-v0.134.0',
  commit: 'a75c443',
  release_date: '2026-05-26',
  local_detection: [
    'codex --version',
    'codex exec --help',
    'codex mcp --help'
  ],
  release_notes_topics: [
    'local conversation history search',
    '--profile primary selector',
    'per-server MCP environments',
    'streamable HTTP OAuth',
    'connector $ref/$defs schema preservation',
    'readOnlyHint concurrent MCP tools',
    'subagent identity in hook inputs',
    'managed network proxy environment'
  ]
})

export function codex0134Capabilities(input: {
  version?: string | null
  available?: boolean
  execHelp?: string
  mcpHelp?: string
  historyHelp?: string
  historyCommandAvailable?: boolean
  schemaPolicyText?: string
} = {}): Codex0134Capability[] {
  const version = parseCodexVersionText(input.version) || input.version || null
  const available = input.available !== false && Boolean(version)
  const meets = available && compareSemverLike(version, CODEX_0_134_VERSION) >= 0
  const status = available ? meets ? 'available' : 'degraded_supported' : 'integration_optional'
  const execHelp = input.execHelp || ''
  const mcpHelp = input.mcpHelp || ''
  const historyHelp = input.historyHelp || ''
  const schemaPolicyText = input.schemaPolicyText || ''
  const profileDetected = /--profile\b/.test(execHelp)
  const historyDetected = input.historyCommandAvailable === true && /history|conversation/i.test(historyHelp)
  const mcpEnvDetected = /env|environment/i.test(mcpHelp)
  const oauthDetected = /oauth|streamable/i.test(mcpHelp)
  const schemaRefsDetected = /\$ref|\$defs|schema/i.test(schemaPolicyText)
  const proxyReport = detectManagedProxyEnv()
  return [
    {
      id: 'profile_primary_selector',
      priority: 'P0',
      status: profileDetected || meets ? status : 'degraded_supported',
      preferred: profileDetected || meets,
      detector: '`codex exec --help` exposes --profile and 0.134 release notes make it the primary profile selector.',
      notes: [
        profileDetected ? 'Local exec help exposes --profile.' : 'Local exec help did not expose --profile; version baseline evidence still records the release expectation.',
        'SKS native agent runners must pass --profile without ignoring the user profile config.'
      ]
    },
    {
      id: 'local_conversation_history_search',
      priority: 'P0',
      status: historyDetected || meets ? status : 'degraded_supported',
      preferred: historyDetected || meets,
      detector: '0.134 release notes add case-insensitive local conversation history search with previews.',
      notes: [
        historyDetected ? 'A standalone local Codex history search help surface was detected.' : 'No standalone `codex search` help surface was detected; support is inferred from the rust-v0.134.0 release baseline when that version is installed.',
        'SKS Source Intelligence has its own bounded local Codex history scanner; it is separate evidence and must not be treated as proof of Codex CLI behavior.'
      ]
    },
    {
      id: 'mcp_per_server_environment',
      priority: 'P0',
      status: mcpEnvDetected || meets ? status : 'degraded_supported',
      preferred: mcpEnvDetected || meets,
      detector: '0.134 release notes add per-server MCP environment targeting.',
      notes: ['MCP config classification records server environment keys separately from tool permissions.']
    },
    {
      id: 'mcp_streamable_http_oauth',
      priority: 'P1',
      status: oauthDetected || meets ? status : 'warning_only',
      preferred: oauthDetected || meets,
      detector: '0.134 release notes add OAuth options for streamable HTTP MCP servers.',
      notes: ['OAuth support is release-readiness evidence only unless a route explicitly configures live MCP auth.']
    },
    {
      id: 'connector_schema_refs_defs_compaction',
      priority: 'P0',
      status: schemaRefsDetected || meets ? status : 'degraded_supported',
      preferred: schemaRefsDetected || meets,
      detector: '0.134 release notes preserve local $ref/$defs and compact oversized connector schemas.',
      notes: ['SKS schema compaction keeps $ref and $defs keys in the compacted preview.']
    },
    {
      id: 'mcp_readonly_parallel_hint',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: '0.134 release notes allow concurrent read-only MCP tools when readOnlyHint is advertised.',
      notes: ['SKS treats readOnlyHint as advisory; concurrency still requires destructive-name and schema safety checks.']
    },
    {
      id: 'hook_subagent_context',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: '0.134 release notes add richer hook context and subagent identity in hook inputs.',
      notes: ['Official hook input compatibility is limited to vendored Codex schema fields; SKS slot_id, generation_index, persona_id, and transcript path are internal cockpit evidence fields, not injected into official hook inputs.']
    },
    {
      id: 'managed_network_proxy_env',
      priority: 'P0',
      status,
      preferred: status === 'available',
      detector: '0.134 release notes ensure Node-based tools honor Codex managed network proxy environment.',
      notes: [
        proxyReport.keys_present.length ? `Managed proxy keys detected: ${proxyReport.keys_present.join(', ')}` : 'No managed proxy keys present in this process.',
        'SKS Codex child-process adapters explicitly forward proxy environment keys.'
      ]
    },
    {
      id: 'workspace_usage_limit_messages',
      priority: 'P1',
      status: status === 'available' ? 'warning_only' : status,
      detector: '0.134 release notes display workspace-specific credit and spend-cap usage-limit messages.',
      notes: ['Recorded as UX/copy compatibility evidence; it is not a release blocker for non-interactive SKS routes.']
    },
    {
      id: 'remote_reliability_retries',
      priority: 'P2',
      status: status === 'available' ? 'warning_only' : status,
      detector: '0.134 release notes reconnect stale exec-server websocket clients and retry auth/compaction flows.',
      notes: ['Remote retry behavior is tracked as optional remote-control resilience evidence.']
    }
  ]
}

export function codex0134Matrix(input: {
  version?: string | null
  available?: boolean
  execHelp?: string
  mcpHelp?: string
  historyHelp?: string
  historyCommandAvailable?: boolean
  schemaPolicyText?: string
} = {}) {
  const capabilities = codex0134Capabilities(input)
  const hardBlockers = capabilities.filter((capability) => capability.priority === 'P0' && capability.status === 'degraded_supported')
  return {
    schema: CODEX_0_134_SCHEMA,
    baseline: CODEX_0_134_BASELINE_TAG,
    required_version: CODEX_0_134_VERSION,
    release_evidence: CODEX_0_134_RELEASE_EVIDENCE,
    inherited_baselines: ['rust-v0.133.0', 'rust-v0.132.0'],
    capabilities,
    profile_primary_selector: capabilities.find((capability) => capability.id === 'profile_primary_selector')?.preferred === true,
    local_history_search_supported: capabilities.find((capability) => capability.id === 'local_conversation_history_search')?.preferred === true,
    mcp_0_134_modernization_supported: capabilities.some((capability) => capability.id.startsWith('mcp_') && capability.preferred === true),
    managed_proxy_env_supported: capabilities.find((capability) => capability.id === 'managed_network_proxy_env')?.status !== 'degraded_supported',
    hook_subagent_context_supported: capabilities.find((capability) => capability.id === 'hook_subagent_context')?.preferred === true,
    unknown_future_fields_policy: 'warning_only_baseline_validation',
    ok: hardBlockers.length === 0 || input.available === false,
    blockers: hardBlockers.map((capability) => `codex_0_134_capability_degraded:${capability.id}`)
  }
}

export async function collectCodex0134LocalEvidence(opts: { codexBin?: string | null } = {}): Promise<Codex0134LocalEvidence> {
  const bin = opts.codexBin || await which('codex')
  if (!bin) {
    return {
      available: false,
      versionText: '',
      execHelp: '',
      mcpHelp: '',
      historyHelp: '',
      historyCommandAvailable: false,
      schemaPolicyText: '',
      warnings: ['codex_binary_missing']
    }
  }
  const run = async (args: string[]) => runProcess(bin, args, { timeoutMs: 10000, maxOutputBytes: 64 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err.message || String(err)
  }))
  const [version, execHelp, mcpHelp, searchHelp] = await Promise.all([
    run(['--version']),
    run(['exec', '--help']),
    run(['mcp', '--help']),
    run(['search', '--help'])
  ])
  return {
    available: version.code === 0,
    versionText: `${version.stdout || ''}${version.stderr || ''}`.trim(),
    execHelp: `${execHelp.stdout || ''}${execHelp.stderr || ''}`,
    mcpHelp: `${mcpHelp.stdout || ''}${mcpHelp.stderr || ''}`,
    historyHelp: `${searchHelp.stdout || ''}${searchHelp.stderr || ''}`,
    historyCommandAvailable: searchHelp.code === 0 && /^\s*Usage:\s+codex\s+search\b/m.test(`${searchHelp.stdout || ''}${searchHelp.stderr || ''}`),
    schemaPolicyText: '$ref $defs readOnlyHint',
    warnings: [
      ...(execHelp.code === 0 ? [] : ['codex_exec_help_unavailable']),
      ...(mcpHelp.code === 0 ? [] : ['codex_mcp_help_unavailable']),
      ...(searchHelp.code === 0 ? [] : ['codex_history_search_help_unavailable'])
    ]
  }
}

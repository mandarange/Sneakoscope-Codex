import path from 'node:path'
import { ensureDir, nowIso, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { detectCodexWebSearchCapability, type CodexWebSearchEvidence, type CodexWebSearchFunction } from '../codex/codex-web-search-adapter.js'
import { runUltraSearch, type UltraSearchMode, type UltraSearchResult, type UltraSearchSourceFunction } from '../ultra-search/index.js'
import { buildSourceIntelligencePolicy, writeSourceIntelligencePolicyArtifact, type SourceIntelligencePolicy } from './source-intelligence-policy.js'
import { buildSourceIntelligenceProof, type SourceIntelligenceProof } from './source-intelligence-proof.js'
import { buildAppshotsEvidence, writeAppshotsEvidenceArtifact, type AppshotsEvidence } from './appshots-evidence.js'

export const SOURCE_INTELLIGENCE_EVIDENCE_SCHEMA = 'sks.source-intelligence-evidence.v2'

export interface Context7Evidence {
  schema: 'sks.context7-source-evidence.v1'
  ok: boolean
  status: 'completed' | 'not_invoked' | 'missing' | 'not_required'
  query: string
  result_count: number
  blockers: string[]
}

export interface SourceIntelligenceEvidence {
  schema: typeof SOURCE_INTELLIGENCE_EVIDENCE_SCHEMA
  generated_at: string
  ok: boolean
  route: string
  query: string
  mode: SourceIntelligencePolicy['mode']
  parallel: {
    safe_parallel_queries: boolean
    providers_requested: string[]
    providers_completed: string[]
  }
  cache: {
    key: string
    local_only: boolean
    ultra_search_hit: boolean
  }
  policy: SourceIntelligencePolicy
  context7: Context7Evidence
  codex_web_search: CodexWebSearchEvidence | null
  ultra_search: UltraSearchResult
  appshots: AppshotsEvidence | null
  proof: SourceIntelligenceProof
  blockers: string[]
  warnings: string[]
}

export type Context7SourceFunction = UltraSearchSourceFunction

export async function runSourceIntelligence(input: {
  root?: string
  missionDir: string
  route?: string
  query: string
  offline?: boolean
  context7Available?: boolean
  context7?: Context7SourceFunction
  codexWebSearch?: CodexWebSearchFunction
  xaiSearch?: unknown
  xaiDetection?: unknown
  appshots?: {
    visualRequired?: boolean
    sourcePaths?: string[]
    sourceMetadata?: Array<{
      path: string
      source_type?: 'codex_appshot' | 'screenshot' | 'text' | 'unknown'
      origin?: 'codex_app' | 'fixture' | 'unknown'
      operator_attached?: boolean
      frontmost_window?: boolean
      redacted?: boolean
      local_only?: boolean
      fixture?: boolean
      thread_id?: string | null
      attachment_id?: string | null
      source_app?: string | null
      source_window?: string | null
    }>
    threadAttachments?: Array<{
      thread_id?: string | null
      attachment_id?: string | null
      kind?: string | null
      mime_type?: string | null
      source_app?: string | null
      source_window?: string | null
      local_only?: boolean
      codex_appshot?: boolean
    }>
    operatorActionRecorded?: boolean
    appshotsToolAvailable?: boolean
  }
  env?: NodeJS.ProcessEnv
}): Promise<SourceIntelligenceEvidence> {
  const root = path.resolve(input.root || process.cwd())
  const missionDir = path.resolve(input.missionDir)
  const artifactDir = path.join(missionDir, 'source-intelligence')
  await ensureDir(artifactDir)
  const codexWebCapability = detectCodexWebSearchCapability({
    ...(input.env ? { env: input.env } : {}),
    ...(input.offline === undefined ? {} : { offline: input.offline })
  })
  const policy = buildSourceIntelligencePolicy({
    ...(input.route === undefined ? {} : { route: input.route }),
    ...(input.offline === undefined ? {} : { offline: input.offline }),
    ...(input.context7Available === undefined ? {} : { context7Available: input.context7Available }),
    codexWebCapability,
    query: input.query,
    ...(input.xaiDetection === undefined ? {} : { xaiDetection: input.xaiDetection })
  })
  const context7 = await runContext7(input.query, {
    required: policy.context7.required,
    available: policy.context7.available,
    offline: input.offline === true,
    ...(input.context7 ? { context7: input.context7 } : {})
  })
  const ultraMode = sourceModeToUltraMode(policy.mode)
  const ultraSearch = await runUltraSearch({
    root,
    missionDir,
    route: input.route || 'unknown',
    query: input.query,
    mode: ultraMode,
    ...(input.offline === undefined ? {} : { offline: input.offline }),
    ...(input.context7 ? { context7: input.context7 } : {}),
    ...(input.codexWebSearch ? { codexWebSearch: input.codexWebSearch } : {}),
    ...(input.env ? { env: input.env } : {})
  })
  const appshots = buildAppshotsEvidence({
    root,
    prompt: input.query,
    ...(input.appshots?.visualRequired === undefined ? {} : { visualRequired: input.appshots.visualRequired }),
    ...(input.appshots?.sourcePaths === undefined ? {} : { sourcePaths: input.appshots.sourcePaths }),
    ...(input.appshots?.sourceMetadata === undefined ? {} : { sourceMetadata: input.appshots.sourceMetadata }),
    ...(input.appshots?.threadAttachments === undefined ? {} : { threadAttachments: input.appshots.threadAttachments }),
    ...(input.appshots?.operatorActionRecorded === undefined ? {} : { operatorActionRecorded: input.appshots.operatorActionRecorded }),
    ...(input.appshots?.appshotsToolAvailable === undefined ? {} : { appshotsToolAvailable: input.appshots.appshotsToolAvailable })
  })
  const providersRequested = policy.selected_providers
  const providersCompleted = [
    ...(context7.ok && policy.context7.required ? ['context7'] : []),
    ...(ultraSearch.sources.some((source) => source.provider_id === 'codex_web') ? ['codex_web'] : []),
    ...(ultraSearch.sources.some((source) => source.provider_id === 'x_public') ? ['x_public'] : []),
    'ultra_search'
  ]
  const proof = buildSourceIntelligenceProof(policy, { context7, ultra_search: ultraSearch, appshots })
  const blockers = [...new Set([...policy.blockers, ...context7.blockers, ...appshots.blockers, ...proof.blockers])]
  const warnings = [...new Set([...policy.warnings, ...ultraSearch.warnings, ...appshots.warnings])]
  const cacheKey = sha256(JSON.stringify({ route: input.route || 'unknown', query: input.query, mode: policy.mode })).slice(0, 16)
  const evidence: SourceIntelligenceEvidence = {
    schema: SOURCE_INTELLIGENCE_EVIDENCE_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route: input.route || 'unknown',
    query: input.query,
    mode: policy.mode,
    parallel: {
      safe_parallel_queries: true,
      providers_requested: providersRequested,
      providers_completed: providersCompleted
    },
    cache: {
      key: cacheKey,
      local_only: true,
      ultra_search_hit: ultraSearch.cache.hit
    },
    policy,
    context7,
    codex_web_search: null,
    ultra_search: ultraSearch,
    appshots,
    proof,
    blockers,
    warnings
  }
  await writeSourceIntelligencePolicyArtifact(missionDir, policy)
  await writeAppshotsEvidenceArtifact(missionDir, appshots)
  await writeJsonAtomic(path.join(missionDir, 'source-intelligence-evidence.json'), evidence)
  await writeTextAtomic(path.join(missionDir, 'source-intelligence-evidence.md'), renderSourceIntelligenceEvidenceMarkdown(evidence))
  await writeJsonAtomic(path.join(artifactDir, `${cacheKey}.json`), evidence)
  return evidence
}

export function renderSourceIntelligenceEvidenceMarkdown(evidence: SourceIntelligenceEvidence): string {
  return [
    '# Source Intelligence Evidence',
    '',
    `- Route: ${evidence.route}`,
    `- Mode: ${evidence.mode}`,
    `- Context7: ${evidence.context7.status}`,
    `- UltraSearch: ${evidence.ultra_search.proof.ok ? 'ok' : 'partial'}`,
    `- Legacy x-search MCP: not_required`,
    `- Appshots: ${evidence.appshots?.status || 'not_required'}`,
    `- Providers completed: ${evidence.parallel.providers_completed.join(', ') || 'none'}`,
    `- Blockers: ${evidence.blockers.length ? evidence.blockers.join(', ') : 'none'}`,
    ''
  ].join('\n')
}

function sourceModeToUltraMode(mode: SourceIntelligencePolicy['mode']): UltraSearchMode {
  if (mode === 'ultra_fast') return 'fast'
  if (mode === 'ultra_deep') return 'deep'
  if (mode === 'ultra_exhaustive') return 'exhaustive'
  if (mode === 'url_acquisition') return 'url_acquisition'
  if (mode === 'x_search') return 'x_search'
  if (mode === 'offline_cache') return 'offline_cache'
  return 'balanced'
}

async function runContext7(query: string, opts: { required?: boolean; available?: boolean; offline?: boolean; context7?: Context7SourceFunction }): Promise<Context7Evidence> {
  if (!opts.required) {
    return { schema: 'sks.context7-source-evidence.v1', ok: true, status: 'not_required', query, result_count: 0, blockers: [] }
  }
  if (opts.available === false) {
    return { schema: 'sks.context7-source-evidence.v1', ok: false, status: 'missing', query, result_count: 0, blockers: ['docs_context_missing'] }
  }
  if (!opts.context7) {
    return opts.offline === true
      ? { schema: 'sks.context7-source-evidence.v1', ok: true, status: 'not_invoked', query, result_count: 0, blockers: [] }
      : { schema: 'sks.context7-source-evidence.v1', ok: false, status: 'missing', query, result_count: 0, blockers: ['context7_not_invoked'] }
  }
  const raw = await opts.context7(query)
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.results) ? (raw as any).results : raw ? [raw] : []
  return { schema: 'sks.context7-source-evidence.v1', ok: true, status: 'completed', query, result_count: rows.length, blockers: [] }
}

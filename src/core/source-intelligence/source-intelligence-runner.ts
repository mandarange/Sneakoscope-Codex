import path from 'node:path'
import { ensureDir, nowIso, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { detectXaiMcp, type XaiMcpDetection } from '../mcp/xai-mcp-detector.js'
import { runXaiSearch, type XaiSearchFunction, type XaiSearchEvidence } from '../mcp/xai-search-adapter.js'
import { detectCodexWebSearchCapability, runCodexWebSearch, type CodexWebSearchEvidence, type CodexWebSearchFunction } from '../codex/codex-web-search-adapter.js'
import { buildSourceIntelligencePolicy, writeSourceIntelligencePolicyArtifact, type SourceIntelligencePolicy } from './source-intelligence-policy.js'
import { buildSourceIntelligenceProof, type SourceIntelligenceProof } from './source-intelligence-proof.js'
import { buildAppshotsEvidence, writeAppshotsEvidenceArtifact, type AppshotsEvidence } from './appshots-evidence.js'

export const SOURCE_INTELLIGENCE_EVIDENCE_SCHEMA = 'sks.source-intelligence-evidence.v1'

export interface Context7Evidence {
  schema: 'sks.context7-source-evidence.v1'
  ok: boolean
  status: 'completed' | 'not_invoked' | 'missing'
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
  }
  policy: SourceIntelligencePolicy
  context7: Context7Evidence
  codex_web_search: CodexWebSearchEvidence | null
  xai_search: XaiSearchEvidence | null
  appshots: AppshotsEvidence | null
  proof: SourceIntelligenceProof
  blockers: string[]
  warnings: string[]
}

export type Context7SourceFunction = (query: string) => Promise<unknown>

export async function runSourceIntelligence(input: {
  root?: string
  missionDir: string
  route?: string
  query: string
  offline?: boolean
  context7Available?: boolean
  context7?: Context7SourceFunction
  codexWebSearch?: CodexWebSearchFunction
  xaiSearch?: XaiSearchFunction
  xaiDetection?: XaiMcpDetection
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
  const xaiDetection = input.xaiDetection || await detectXaiMcp({ root })
  const codexWebCapability = detectCodexWebSearchCapability({
    ...(input.env ? { env: input.env } : {}),
    ...(input.offline === undefined ? {} : { offline: input.offline })
  })
  const policy = buildSourceIntelligencePolicy({
    ...(input.route === undefined ? {} : { route: input.route }),
    ...(input.offline === undefined ? {} : { offline: input.offline }),
    ...(input.context7Available === undefined ? {} : { context7Available: input.context7Available }),
    codexWebCapability,
    xaiDetection
  })
  const cacheKey = sha256(JSON.stringify({ route: input.route || 'unknown', query: input.query, mode: policy.mode })).slice(0, 16)
  const providerTasks = [
    runContext7(input.query, {
      available: policy.context7.available,
      offline: input.offline === true,
      ...(input.context7 ? { context7: input.context7 } : {})
    }),
    policy.codex_web_search.required ? runCodexWebSearch(input.query, {
      ...(input.codexWebSearch ? { search: input.codexWebSearch } : {}),
      artifactDir,
      ...(input.offline === undefined ? {} : { offline: input.offline }),
      ...(input.env ? { env: input.env } : {})
    }) : Promise.resolve(null),
    policy.xai_mcp.required ? runXaiSearch(input.query, {
      ...(input.xaiSearch ? { search: input.xaiSearch } : {}),
      artifactDir,
      configured: true
    }) : Promise.resolve(null)
  ] as const
  const [context7, codexWeb, xaiSearch] = await Promise.all(providerTasks)
  const appshots = buildAppshotsEvidence({
    root,
    prompt: input.query,
    ...(input.appshots?.visualRequired === undefined ? {} : { visualRequired: input.appshots.visualRequired }),
    ...(input.appshots?.sourcePaths === undefined ? {} : { sourcePaths: input.appshots.sourcePaths }),
    ...(input.appshots?.sourceMetadata === undefined ? {} : { sourceMetadata: input.appshots.sourceMetadata }),
    ...(input.appshots?.operatorActionRecorded === undefined ? {} : { operatorActionRecorded: input.appshots.operatorActionRecorded }),
    ...(input.appshots?.appshotsToolAvailable === undefined ? {} : { appshotsToolAvailable: input.appshots.appshotsToolAvailable })
  })
  const providersRequested = [
    'context7',
    ...(policy.codex_web_search.required ? ['codex_web_search'] : []),
    ...(policy.xai_mcp.required ? ['xai_search'] : [])
  ]
  const providersCompleted = [
    ...(context7.ok ? ['context7'] : []),
    ...(codexWeb?.ok ? ['codex_web_search'] : []),
    ...(xaiSearch?.ok ? ['xai_search'] : [])
  ]
  const proof = buildSourceIntelligenceProof(policy, { context7, codex_web_search: codexWeb, xai_search: xaiSearch, appshots })
  const blockers = [...policy.blockers, ...context7.blockers, ...(codexWeb?.blockers || []), ...appshots.blockers, ...(proof.blockers || [])]
  const warnings = [...policy.warnings, ...(codexWeb?.warnings || []), ...appshots.warnings, ...(xaiSearch?.blockers || []).filter((blocker) => !blockers.includes(blocker))]
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
      local_only: true
    },
    policy,
    context7,
    codex_web_search: codexWeb,
    xai_search: xaiSearch,
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
    `- Codex Web Search: ${evidence.codex_web_search?.status || 'not_required'}`,
    `- X AI Search: ${evidence.xai_search?.status || 'not_required'}`,
    `- Appshots: ${evidence.appshots?.status || 'not_required'}`,
    `- Providers completed: ${evidence.parallel.providers_completed.join(', ') || 'none'}`,
    `- Blockers: ${evidence.blockers.length ? evidence.blockers.join(', ') : 'none'}`,
    ''
  ].join('\n')
}

async function runContext7(query: string, opts: { available?: boolean; offline?: boolean; context7?: Context7SourceFunction }): Promise<Context7Evidence> {
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

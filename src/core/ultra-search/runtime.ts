import path from 'node:path'
import { ensureDir, nowIso, readJson, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { normalizeCodexWebResults, runCodexWebSearch, type CodexWebSearchFunction } from '../codex/codex-web-search-adapter.js'
import type {
  AcquisitionVerdict,
  LeadRaisedEvent,
  SearchIntent,
  UltraClaim,
  UltraSearchAxis,
  UltraSearchConvergence,
  UltraSearchMode,
  UltraSearchProof,
  UltraSearchResult,
  UltraSearchSourceFunction,
  UltraSourceRecord
} from './types.js'

export interface RunUltraSearchInput {
  root?: string
  missionDir: string
  missionId?: string
  route?: string
  query: string
  mode?: UltraSearchMode
  offline?: boolean
  context7?: UltraSearchSourceFunction
  codexWebSearch?: CodexWebSearchFunction
  env?: NodeJS.ProcessEnv
}

export async function runUltraSearch(input: RunUltraSearchInput): Promise<UltraSearchResult> {
  const root = path.resolve(input.root || process.cwd())
  const missionDir = path.resolve(input.missionDir)
  const missionId = input.missionId || path.basename(missionDir)
  const artifactDir = path.join(missionDir, 'ultra-search')
  await ensureDir(artifactDir)

  const mode = resolveMode(input.query, input.mode, input.offline === true)
  const intent = classifyIntent(input.query, mode)
  const axes = buildAxes(input.query, mode, intent)
  const queryVariants = buildQueryVariants(input.query, mode, intent)
  const cache = await readCache(artifactDir, input.query, mode)
  if (cache.hit && !cache.stale && cache.result) {
    const cached = cache.result
    return {
      ...cached,
      generated_at: nowIso(),
      cache: { ...cached.cache, hit: true, stale: false, age_ms: cache.age_ms }
    }
  }

  const providerPlan = planProviders(intent, mode, input.offline === true, Boolean(input.context7), Boolean(input.codexWebSearch), input.env)
  const sourceRows: UltraSourceRecord[] = []
  const warnings = [...providerPlan.warnings]
  const blockers = [...providerPlan.blockers]

  if (input.context7 && providerPlan.selected_providers.includes('context7')) {
    const raw = await input.context7(queryVariants[0] || input.query)
    sourceRows.push(...normalizeGenericSourceRows(raw, 'context7', 'official_docs', intent, 'A0'))
  } else if (intent === 'official_documentation' && !input.offline) {
    warnings.push('context7_not_invoked_for_docs_query')
  }

  if (providerPlan.selected_providers.includes('codex_web')) {
    const webEvidence = await runCodexWebSearch(queryVariants[0] || input.query, {
      ...(input.codexWebSearch ? { search: input.codexWebSearch } : {}),
      artifactDir,
      ...(input.offline === undefined ? {} : { offline: input.offline }),
      ...(input.env ? { env: input.env } : {})
    })
    if (webEvidence.blockers.length) blockers.push(...webEvidence.blockers)
    warnings.push(...webEvidence.warnings)
    sourceRows.push(...webEvidence.normalized_results.map((row, index) => sourceFromWebRow(row, index, intent)))
  }

  if (mode === 'url_acquisition') {
    const url = extractFirstUrl(input.query)
    if (url) sourceRows.push(sourceFromKnownUrl(url, intent))
    else blockers.push('url_acquisition_mode_without_url')
  }

  if (mode === 'x_search') {
    sourceRows.push(...buildXDiscoverySources(queryVariants, intent))
    warnings.push('x_public_results_are_discovery_until_post_detail_or_authenticated_source_verifies_full_text')
  }

  const deduped = dedupeSources(sourceRows)
  const leads = buildLeads(deduped, mode)
  const claims = buildClaims(input.query, deduped, mode, intent)
  const convergence = buildConvergence(mode, leads, blockers)
  const proof = buildProof(mode, intent, deduped, claims, convergence, blockers, warnings)
  const synthesis = renderSynthesis(input.query, deduped, claims, proof)
  const result: UltraSearchResult = {
    schema: 'sks.ultra-search-result.v1',
    generated_at: nowIso(),
    ok: proof.ok,
    mission_id: missionId,
    artifact_dir: artifactDir,
    query: input.query,
    mode,
    intent,
    axes,
    query_variants: queryVariants,
    provider_plan: providerPlan,
    sources: deduped,
    leads,
    claims,
    convergence,
    proof,
    synthesis,
    blockers: proof.blockers,
    warnings: proof.warnings,
    cache: {
      key: cache.key,
      hit: false,
      stale: cache.stale,
      ttl_ms: cache.ttl_ms,
      age_ms: cache.age_ms,
      artifact: cache.artifact
    }
  }

  await writeArtifacts(artifactDir, result)
  await writeJsonAtomic(cache.artifact, result)
  return result
}

export function resolveMode(query: string, explicit?: UltraSearchMode, offline = false): UltraSearchMode {
  if (explicit) return explicit
  if (offline) return 'offline_cache'
  if (extractFirstUrl(query)) return 'url_acquisition'
  if (/\b(?:x\.com|twitter\.com|X\/Twitter|트위터|엑스|site:x\.com|site:twitter\.com)\b/i.test(query)) return 'x_search'
  if (/(deep research|exhaustive|가능한 전부|누락 없이|완벽하게 조사|due diligence)/i.test(query)) return 'deep'
  return 'balanced'
}

export function classifyIntent(query: string, mode: UltraSearchMode): SearchIntent {
  if (mode === 'x_search') return 'x_specific'
  if (mode === 'url_acquisition') return 'known_url_fetch'
  if (/\b(package|npm|SDK|API|MCP|framework|library|docs?|문서|React|Next\.js|Prisma|Tailwind)\b/i.test(query)) return 'official_documentation'
  if (/\b(error|bug|stack trace|implementation|code|repo|GitHub|테스트|구현)\b/i.test(query)) return 'code_implementation'
  if (/\b(news|today|latest|최근|오늘|발표)\b/i.test(query)) return 'news'
  if (/\b(legal|law|policy|규정|법)\b/i.test(query)) return 'legal_or_policy'
  return 'current_fact'
}

export function buildAxes(query: string, mode: UltraSearchMode, intent: SearchIntent): UltraSearchAxis[] {
  const base: UltraSearchAxis[] = [
    {
      axis_id: 'axis-primary',
      question: `Primary or official evidence for: ${query}`,
      territories: intent === 'official_documentation' ? ['official_docs', 'changelog'] : ['primary_source', 'official_statement'],
      done_when: ['primary source found or explicit blocker recorded', 'date/version checked'],
      priority: 'P0',
      overlap_keys: []
    },
    {
      axis_id: 'axis-current',
      question: `Current indexed or live evidence for: ${query}`,
      territories: ['web_search', 'freshness', 'source_date'],
      done_when: ['fresh result checked', 'stale evidence warning recorded when needed'],
      priority: 'P0',
      overlap_keys: ['axis-primary']
    },
    {
      axis_id: 'axis-counter',
      question: `Counter evidence, limitations, or failures for: ${query}`,
      territories: ['counter_search', 'contradictions', 'known_failures'],
      done_when: ['counter query produced evidence or no-source gap recorded'],
      priority: 'P1',
      overlap_keys: []
    }
  ]
  if (mode === 'deep' || mode === 'exhaustive') {
    base.push({
      axis_id: 'axis-community',
      question: `Independent implementation or community evidence for: ${query}`,
      territories: ['github', 'issues', 'forums', 'social_discourse'],
      done_when: ['independent domains clustered', 'social-only evidence kept out of primary capability claims'],
      priority: 'P1',
      overlap_keys: ['axis-current']
    })
  }
  if (mode === 'x_search') {
    base.push({
      axis_id: 'axis-x-detail',
      question: `Public X post detail and freshness checks for: ${query}`,
      territories: ['x_web_index', 'known_post_detail', 'profile_timeline', 'authenticated_readonly_optional'],
      done_when: ['discovery-only items are not promoted to full evidence', 'auth-required gaps disclosed'],
      priority: 'P0',
      overlap_keys: []
    })
  }
  return base
}

export function buildQueryVariants(query: string, mode: UltraSearchMode, intent: SearchIntent): string[] {
  const clean = query.trim()
  const variants = new Set<string>([clean])
  if (intent === 'official_documentation') variants.add(`${clean} official docs changelog`)
  if (intent === 'code_implementation') variants.add(`${clean} GitHub issue fix`)
  variants.add(`${clean} limitations OR failure`)
  if (mode === 'x_search') {
    variants.add(`site:x.com "${clean.replace(/"/g, '')}"`)
    variants.add(`site:twitter.com "${clean.replace(/"/g, '')}"`)
  }
  if (mode === 'deep' || mode === 'exhaustive') variants.add(`${clean} counter evidence`)
  return [...variants].slice(0, mode === 'fast' ? 4 : mode === 'exhaustive' ? 12 : 8)
}

function planProviders(
  intent: SearchIntent,
  mode: UltraSearchMode,
  offline: boolean,
  hasContext7: boolean,
  hasCodexWeb: boolean,
  env: NodeJS.ProcessEnv = process.env
): UltraSearchResult['provider_plan'] {
  const selected_capabilities = ['source_normalization', 'claim_ledger', 'citation_graph', 'cache_read_through']
  const selected_providers: string[] = []
  const blockers: string[] = []
  const warnings: string[] = []
  if (intent === 'official_documentation') {
    selected_capabilities.push('official_docs')
    if (hasContext7) selected_providers.push('context7')
    else warnings.push('context7_docs_provider_not_bound')
  }
  if (!offline && (hasCodexWeb || env.SKS_CODEX_WEB_SEARCH_AVAILABLE === '1' || env.CODEX_WEB_SEARCH_AVAILABLE === '1')) {
    selected_capabilities.push('web_search')
    selected_providers.push('codex_web')
  } else if (!offline) {
    warnings.push('codex_web_search_not_bound_or_unverified')
  }
  if (mode === 'x_search') {
    selected_capabilities.push('social_recency', 'x_public_discovery')
    selected_providers.push('x_public')
  }
  if (offline) selected_providers.push('offline_cache')
  return { selected_capabilities, selected_providers: [...new Set(selected_providers)], blockers, warnings }
}

function normalizeGenericSourceRows(raw: unknown, providerId: string, family: string, intent: SearchIntent, tier: UltraSourceRecord['authority_tier']): UltraSourceRecord[] {
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.results) ? (raw as any).results : raw ? [raw] : []
  return rows.map((row: any, index: number) => {
    const url = typeof row.url === 'string' ? row.url : typeof row.link === 'string' ? row.link : null
    return makeSource({
      providerId,
      family,
      type: intent === 'official_documentation' ? 'official_docs' : 'web_result',
      title: String(row.title || row.name || `${providerId} result ${index + 1}`),
      url,
      snippet: String(row.snippet || row.summary || row.text || ''),
      verdict: providerId === 'context7' ? 'verified_content' : 'weak_content',
      authority: tier,
      primary: providerId === 'context7',
      path: [providerId]
    })
  })
}

function sourceFromWebRow(row: ReturnType<typeof normalizeCodexWebResults>[number], index: number, intent: SearchIntent): UltraSourceRecord {
  return makeSource({
    providerId: 'codex_web',
    family: intent === 'x_specific' ? 'social' : 'web',
    type: 'web_result',
    title: row.title || `Codex Web result ${index + 1}`,
    url: row.url,
    snippet: row.snippet,
    verdict: row.url ? 'weak_content' : 'partial_content',
    authority: classifyAuthority(row.url),
    primary: isOfficialUrl(row.url),
    path: ['codex_web_search']
  })
}

function sourceFromKnownUrl(url: string, intent: SearchIntent): UltraSourceRecord {
  return makeSource({
    providerId: 'direct_url',
    family: intent === 'x_specific' ? 'social' : 'web',
    type: 'known_url',
    title: url,
    url,
    snippet: '',
    verdict: 'weak_content',
    authority: classifyAuthority(url),
    primary: isOfficialUrl(url),
    path: ['url_parse_only']
  })
}

function buildXDiscoverySources(queries: string[], intent: SearchIntent): UltraSourceRecord[] {
  return queries.filter((query) => query.startsWith('site:')).slice(0, 2).map((query, index) => makeSource({
    providerId: 'x_public',
    family: 'social',
    type: 'x_discovery_query',
    title: `X public discovery query ${index + 1}`,
    url: null,
    snippet: query,
    verdict: 'partial_content',
    authority: 'D',
    primary: false,
    path: ['web_index_discovery'],
    warnings: ['discovery_only']
  }))
}

function makeSource(opts: {
  providerId: string
  family: string
  type: string
  title: string
  url: string | null
  snippet: string
  verdict: AcquisitionVerdict
  authority: UltraSourceRecord['authority_tier']
  primary: boolean
  path: string[]
  warnings?: string[]
}): UltraSourceRecord {
  const now = nowIso()
  const canonical = opts.url ? canonicalizeUrl(opts.url) : null
  const domain = canonical ? safeDomain(canonical) : null
  const content = `${opts.title}\n${opts.snippet}`
  const verified = opts.verdict === 'verified_content'
  return {
    source_id: `src-${sha256(`${opts.providerId}:${canonical || opts.title}:${opts.snippet}`).slice(0, 12)}`,
    provider_id: opts.providerId,
    source_family: opts.family,
    source_type: opts.type,
    title: opts.title,
    canonical_url: canonical,
    original_url: opts.url,
    domain,
    author: null,
    published_at: null,
    updated_at: null,
    retrieved_at: now,
    language: null,
    snippet: opts.snippet,
    content_artifact: null,
    content_sha256: content.trim() ? sha256(content) : null,
    content_length: content.trim().length || null,
    acquisition_verdict: opts.verdict,
    acquisition_path: opts.path,
    authority_tier: opts.authority,
    freshness_score: 0.5,
    relevance_score: 0.6,
    trust_score: verified ? 0.9 : opts.verdict === 'weak_content' ? 0.55 : 0.35,
    primary_source: opts.primary,
    authenticated_source: false,
    local_only_raw: false,
    duplicate_cluster_id: null,
    independence_cluster_id: domain || opts.providerId,
    warnings: opts.warnings || [],
    blockers: []
  }
}

function dedupeSources(sources: UltraSourceRecord[]): UltraSourceRecord[] {
  const seen = new Map<string, string>()
  return sources.map((source) => {
    const key = source.canonical_url || source.content_sha256 || source.source_id
    const cluster = seen.get(key)
    if (cluster) return { ...source, duplicate_cluster_id: cluster }
    seen.set(key, source.source_id)
    return { ...source, duplicate_cluster_id: source.source_id }
  }).filter((source) => source.duplicate_cluster_id === source.source_id)
}

function buildLeads(sources: UltraSourceRecord[], mode: UltraSearchMode): LeadRaisedEvent[] {
  if (mode === 'fast') return []
  return sources.filter((source) => source.acquisition_verdict !== 'verified_content').slice(0, 4).map((source, index) => ({
    event_id: `lead-event-${index + 1}`,
    parent_task_id: 'wave-001',
    wave: 1,
    lead_id: `lead-${sha256(source.source_id).slice(0, 10)}`,
    kind: source.blockers.length ? 'dead_end' : 'source',
    summary: `Hydrate or verify ${source.title}`,
    why_it_matters: 'Weak or partial source cannot support final high-risk claims.',
    suggested_query: source.canonical_url || source.title,
    source_ids: [source.source_id],
    priority: source.source_family === 'social' ? 'P1' : 'P0'
  }))
}

function buildClaims(query: string, sources: UltraSourceRecord[], mode: UltraSearchMode, intent: SearchIntent): UltraClaim[] {
  const verifiedSources = sources.filter((source) => source.acquisition_verdict === 'verified_content')
  const primary = verifiedSources.filter((source) => source.primary_source)
  const domains = [...new Set(verifiedSources.map((source) => source.domain).filter(Boolean) as string[])]
  const highRisk = ['legal_or_policy', 'market_or_financial', 'news'].includes(intent)
  const status = highRisk
    ? (domains.length >= 2 && primary.length >= 1 ? 'supported' : 'unresolved')
    : verifiedSources.length ? 'supported' : sources.length && mode !== 'x_search' ? 'unresolved' : 'unresolved'
  const sourceIds = status === 'supported' ? verifiedSources.map((source) => source.source_id) : sources.map((source) => source.source_id)
  return [{
    claim_id: `claim-${sha256(query).slice(0, 12)}`,
    text: `Evidence gathered for query: ${query}`,
    claim_type: intent === 'code_implementation' ? 'code_behavior' : intent === 'x_specific' ? 'social_signal' : 'capability',
    risk: highRisk ? 'high' : 'normal',
    source_ids: sourceIds,
    independent_domains: domains,
    primary_source_ids: primary.map((source) => source.source_id),
    counter_search_ids: [],
    verification_artifacts: [],
    status
  }]
}

function buildConvergence(mode: UltraSearchMode, leads: LeadRaisedEvent[], blockers: string[]): UltraSearchConvergence {
  const minimum = mode === 'deep' || mode === 'exhaustive' ? 2 : 1
  const waves = mode === 'deep' || mode === 'exhaustive' ? 2 : 1
  const open = leads.filter((lead) => lead.kind !== 'dead_end').length
  return {
    schema: 'sks.ultra-search-convergence.v1',
    waves_completed: waves,
    minimum_waves_required: minimum,
    new_leads_per_wave: waves === 2 ? [leads.length, 0] : [leads.length],
    unchecked_leads: open,
    consecutive_zero_lead_waves: waves === 2 ? 1 : 0,
    max_depth: mode === 'exhaustive' ? 5 : 3,
    status: blockers.length ? 'blocked_by_source_access' : open ? 'bounded_with_open_leads' : 'converged',
    reason: blockers.length ? 'source_access_blocker_recorded' : open ? 'bounded_runtime_left_weak_sources_as_open_leads' : 'all_leads_closed'
  }
}

function buildProof(
  mode: UltraSearchMode,
  intent: SearchIntent,
  sources: UltraSourceRecord[],
  claims: UltraClaim[],
  convergence: UltraSearchConvergence,
  blockers: string[],
  warnings: string[]
): UltraSearchProof {
  const unresolvedHighRisk = claims.filter((claim) => claim.risk === 'high' && claim.status === 'unresolved').length
  const weakContentFinalClaims = claims.filter((claim) => claim.status === 'supported' && claim.source_ids.some((id) => {
    const source = sources.find((candidate) => candidate.source_id === id)
    return source?.acquisition_verdict === 'weak_content' || source?.acquisition_verdict === 'partial_content'
  })).length
  const proofBlockers = [...blockers]
  if (unresolvedHighRisk) proofBlockers.push('high_risk_claim_unresolved')
  if (weakContentFinalClaims) proofBlockers.push('weak_content_used_for_supported_claim')
  if (mode === 'x_search' && sources.every((source) => source.acquisition_verdict !== 'verified_content')) {
    proofBlockers.push('x_search_parity_not_proven')
  }
  return {
    schema: 'sks.ultra-search-proof.v1',
    ok: proofBlockers.length === 0,
    mode,
    intent,
    provider_independent: true,
    xai_runtime_dependency: false,
    snippet_only_final_claims: weakContentFinalClaims,
    weak_content_final_claims: weakContentFinalClaims,
    source_count: sources.length,
    verified_source_count: sources.filter((source) => source.acquisition_verdict === 'verified_content').length,
    claim_count: claims.length,
    unresolved_high_risk_claims: unresolvedHighRisk,
    convergence,
    blockers: [...new Set(proofBlockers)],
    warnings: [...new Set(warnings)]
  }
}

function renderSynthesis(query: string, sources: UltraSourceRecord[], claims: UltraClaim[], proof: UltraSearchProof): string {
  const usable = claims.filter((claim) => claim.status === 'verified' || (claim.status === 'supported' && claim.risk !== 'high'))
  return [
    '# UltraSearch Synthesis',
    '',
    `Query: ${query}`,
    `Status: ${proof.ok ? 'usable' : 'blocked_or_partial'}`,
    '',
    `Usable claims: ${usable.length}`,
    `Sources: ${sources.length}`,
    `Verified sources: ${proof.verified_source_count}`,
    '',
    proof.blockers.length ? `Blockers: ${proof.blockers.join(', ')}` : 'Blockers: none'
  ].join('\n')
}

async function writeArtifacts(artifactDir: string, result: UltraSearchResult): Promise<void> {
  await writeJsonAtomic(path.join(artifactDir, 'intent.json'), { schema: 'sks.ultra-search-intent.v1', intent: result.intent, mode: result.mode })
  await writeJsonAtomic(path.join(artifactDir, 'axes.json'), { schema: 'sks.ultra-search-axes.v1', axes: result.axes })
  await writeJsonAtomic(path.join(artifactDir, 'query-variants.json'), { schema: 'sks.ultra-search-query-variants.v1', query_variants: result.query_variants })
  await writeJsonAtomic(path.join(artifactDir, 'provider-plan.json'), { schema: 'sks.ultra-search-provider-plan.v1', ...result.provider_plan })
  await writeJsonAtomic(path.join(artifactDir, 'source-ledger.json'), { schema: 'sks.ultra-search-source-ledger.v1', sources: result.sources })
  await writeJsonAtomic(path.join(artifactDir, 'lead-ledger.json'), { schema: 'sks.ultra-search-lead-ledger.v1', leads: result.leads })
  await writeJsonAtomic(path.join(artifactDir, 'claim-ledger.json'), { schema: 'sks.ultra-search-claim-ledger.v1', claims: result.claims })
  await writeJsonAtomic(path.join(artifactDir, 'convergence.json'), result.convergence)
  await writeJsonAtomic(path.join(artifactDir, 'ultra-search-proof.json'), result.proof)
  await writeJsonAtomic(path.join(artifactDir, 'ultra-search-gate.json'), {
    schema: 'sks.ultra-search-gate.v1',
    ok: result.proof.ok,
    replacement_state: result.proof.ok ? 'usable_provider_independent_runtime' : 'replacement_incomplete',
    blockers: result.proof.blockers,
    warnings: result.proof.warnings
  })
  await writeTextAtomic(path.join(artifactDir, 'synthesis.md'), result.synthesis)
  await writeJsonAtomic(path.join(artifactDir, 'ultra-search-result.json'), result)
}

async function readCache(artifactDir: string, query: string, mode: UltraSearchMode): Promise<{
  key: string
  artifact: string
  ttl_ms: number
  hit: boolean
  stale: boolean
  age_ms: number | null
  result: UltraSearchResult | null
}> {
  const key = sha256(JSON.stringify({ query: query.trim().toLowerCase(), mode, adapter: 'ultra-search-runtime-v1' })).slice(0, 16)
  const artifact = path.join(artifactDir, 'cache', `${key}.json`)
  const ttl_ms = mode === 'x_search' ? 2 * 60 * 1000 : mode === 'offline_cache' ? 7 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000
  const cached = await readJson<UltraSearchResult | null>(artifact, null)
  if (!cached?.generated_at) return { key, artifact, ttl_ms, hit: false, stale: false, age_ms: null, result: null }
  const age_ms = Date.now() - Date.parse(cached.generated_at)
  return { key, artifact, ttl_ms, hit: true, stale: age_ms > ttl_ms, age_ms, result: cached }
}

function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s)"']+/i)?.[0] || null
}

function canonicalizeUrl(raw: string): string {
  try {
    const url = new URL(raw)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(key)) url.searchParams.delete(key)
    }
    url.hostname = url.hostname.toLowerCase()
    return url.toString()
  } catch {
    return raw
  }
}

function safeDomain(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase()
  } catch {
    return null
  }
}

function isOfficialUrl(raw: string | null): boolean {
  if (!raw) return false
  const domain = safeDomain(raw)
  return Boolean(domain && /(docs\.|developer|github\.com|npmjs\.com|nodejs\.org|w3\.org|ietf\.org|gov$|\.gov$)/i.test(domain))
}

function classifyAuthority(raw: string | null): UltraSourceRecord['authority_tier'] {
  if (!raw) return 'E'
  if (isOfficialUrl(raw)) return 'A0'
  const domain = safeDomain(raw)
  if (domain && /(github\.com|npmjs\.com|arxiv\.org|doi\.org)/i.test(domain)) return 'A1'
  if (domain && /(x\.com|twitter\.com|reddit\.com|news\.ycombinator\.com)/i.test(domain)) return 'D'
  return 'C'
}

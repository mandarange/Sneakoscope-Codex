import path from 'node:path'
import { ensureDir, nowIso, readJson, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { runCodexWebSearch, type CodexWebSearchFunction } from '../codex/codex-web-search-adapter.js'
import { humanizeBlockers } from '../errors/blocker-humanizer.js'
import {
  buildAttemptLedger,
  buildClaims,
  buildConvergence,
  buildLeads,
  buildProof,
  buildXDiscoverySources,
  dedupeSources,
  extractFirstUrl,
  normalizeGenericSourceRows,
  renderSynthesis,
  sourceFromUrlFetch,
  sourceFromWebRow
} from './runtime-helpers.js'
import type {
  SearchIntent,
  SuperSearchAxis,
  SuperSearchMode,
  SuperSearchResult,
  SuperSearchSourceFunction,
  SuperSearchSourceRecord
} from './types.js'

export interface RunSuperSearchInput {
  root?: string
  missionDir: string
  missionId?: string
  route?: string
  query: string
  mode?: SuperSearchMode
  offline?: boolean
  context7?: SuperSearchSourceFunction
  codexWebSearch?: CodexWebSearchFunction
  env?: NodeJS.ProcessEnv
}

export async function runSuperSearch(input: RunSuperSearchInput): Promise<SuperSearchResult> {
  const root = path.resolve(input.root || process.cwd())
  const missionDir = path.resolve(input.missionDir)
  const missionId = input.missionId || path.basename(missionDir)
  const artifactDir = path.join(missionDir, 'super-search')
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
  const sourceRows: SuperSearchSourceRecord[] = []
  const warnings = [...providerPlan.warnings]
  const blockers = [...providerPlan.blockers]
  if (!providerPlan.selected_providers.length && mode !== 'url_acquisition') blockers.push('source_acquisition_unavailable')

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
    if (url) {
      const fetched = await sourceFromUrlFetch(url, artifactDir, intent)
      sourceRows.push(fetched.source)
      blockers.push(...fetched.blockers)
      warnings.push(...fetched.warnings)
    }
    else blockers.push('missing_url_for_super_search_fetch')
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
  const attemptLedger = buildAttemptLedger(providerPlan, mode, proof.blockers, proof.warnings)
  const synthesis = renderSynthesis(input.query, deduped, claims, proof)
  const result: SuperSearchResult = {
    schema: 'sks.super-search-result.v1',
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
    attempt_ledger: attemptLedger,
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

export function resolveMode(query: string, explicit?: SuperSearchMode, offline = false): SuperSearchMode {
  if (explicit) return explicit
  if (offline) return 'offline_cache'
  if (extractFirstUrl(query)) return 'url_acquisition'
  if (/\b(?:x\.com|twitter\.com|X\/Twitter|트위터|엑스|site:x\.com|site:twitter\.com)\b/i.test(query)) return 'x_search'
  if (/(deep research|exhaustive|가능한 전부|누락 없이|완벽하게 조사|due diligence)/i.test(query)) return 'deep'
  return 'balanced'
}

export function classifyIntent(query: string, mode: SuperSearchMode): SearchIntent {
  if (mode === 'x_search') return 'x_specific'
  if (mode === 'url_acquisition') return 'known_url_fetch'
  if (/\b(package|npm|SDK|API|MCP|framework|library|docs?|문서|React|Next\.js|Prisma|Tailwind)\b/i.test(query)) return 'official_documentation'
  if (/\b(error|bug|stack trace|implementation|code|repo|GitHub|테스트|구현)\b/i.test(query)) return 'code_implementation'
  if (/\b(news|today|latest|최근|오늘|발표)\b/i.test(query)) return 'news'
  if (/\b(legal|law|policy|규정|법)\b/i.test(query)) return 'legal_or_policy'
  return 'current_fact'
}

export function buildAxes(query: string, mode: SuperSearchMode, intent: SearchIntent): SuperSearchAxis[] {
  const base: SuperSearchAxis[] = [
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

export function buildQueryVariants(query: string, mode: SuperSearchMode, intent: SearchIntent): string[] {
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
  mode: SuperSearchMode,
  offline: boolean,
  hasContext7: boolean,
  hasCodexWeb: boolean,
  env: NodeJS.ProcessEnv = process.env
): SuperSearchResult['provider_plan'] {
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

async function writeArtifacts(artifactDir: string, result: SuperSearchResult): Promise<void> {
  await writeJsonAtomic(path.join(artifactDir, 'intent.json'), { schema: 'sks.super-search-intent.v1', intent: result.intent, mode: result.mode })
  await writeJsonAtomic(path.join(artifactDir, 'axes.json'), { schema: 'sks.super-search-axes.v1', axes: result.axes })
  await writeJsonAtomic(path.join(artifactDir, 'query-variants.json'), { schema: 'sks.super-search-query-variants.v1', query_variants: result.query_variants })
  await writeJsonAtomic(path.join(artifactDir, 'provider-plan.json'), { schema: 'sks.super-search-provider-plan.v1', ...result.provider_plan })
  await writeJsonAtomic(path.join(artifactDir, 'source-ledger.json'), { schema: 'sks.super-search-source-ledger.v1', sources: result.sources })
  await writeJsonAtomic(path.join(artifactDir, 'lead-ledger.json'), { schema: 'sks.super-search-lead-ledger.v1', leads: result.leads })
  await writeJsonAtomic(path.join(artifactDir, 'claim-ledger.json'), { schema: 'sks.super-search-claim-ledger.v1', claims: result.claims })
  await writeJsonAtomic(path.join(artifactDir, 'attempt-ledger.json'), result.attempt_ledger)
  await writeJsonAtomic(path.join(artifactDir, 'convergence.json'), result.convergence)
  await writeJsonAtomic(path.join(artifactDir, 'super-search-proof.json'), result.proof)
  const gateEvidencePaths = [
    path.join(artifactDir, 'source-ledger.json'),
    path.join(artifactDir, 'claim-ledger.json'),
    path.join(artifactDir, 'super-search-proof.json'),
    path.join(artifactDir, 'super-search-result.json')
  ]
  const blockerDiagnostics = humanizeBlockers(result.proof.blockers, gateEvidencePaths)
  await writeJsonAtomic(path.join(artifactDir, 'super-search-gate.json'), {
    schema: 'sks.super-search-gate.v1',
    ok: result.proof.ok,
    passed: result.proof.ok,
    execution_class: 'production',
    mock_only: false,
    replacement_state: result.proof.ok ? 'usable_provider_independent_runtime' : 'replacement_incomplete',
    blockers: result.proof.blockers,
    human_summary: blockerDiagnostics.human_summary,
    next_actions: blockerDiagnostics.next_actions,
    evidence_paths: blockerDiagnostics.evidence_paths,
    warnings: result.proof.warnings
  })
  await writeTextAtomic(path.join(artifactDir, 'synthesis.md'), result.synthesis)
  await writeJsonAtomic(path.join(artifactDir, 'super-search-result.json'), result)
}

async function readCache(artifactDir: string, query: string, mode: SuperSearchMode): Promise<{
  key: string
  artifact: string
  ttl_ms: number
  hit: boolean
  stale: boolean
  age_ms: number | null
  result: SuperSearchResult | null
}> {
  const key = sha256(JSON.stringify({ query: query.trim().toLowerCase(), mode, adapter: 'super-search-runtime-v1' })).slice(0, 16)
  const artifact = path.join(artifactDir, 'cache', `${key}.json`)
  const ttl_ms = mode === 'x_search' ? 2 * 60 * 1000 : mode === 'offline_cache' ? 7 * 24 * 60 * 60 * 1000 : 10 * 60 * 1000
  const cached = await readJson<SuperSearchResult | null>(artifact, null)
  if (!cached?.generated_at) return { key, artifact, ttl_ms, hit: false, stale: false, age_ms: null, result: null }
  const age_ms = Date.now() - Date.parse(cached.generated_at)
  return { key, artifact, ttl_ms, hit: true, stale: age_ms > ttl_ms, age_ms, result: cached }
}

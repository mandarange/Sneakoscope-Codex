import path from 'node:path'
import dns from 'node:dns/promises'
import net from 'node:net'
import { nowIso, sha256, writeTextAtomic } from '../fsx.js'
import { evaluateRealEvidencePolicy } from '../verification/real-evidence-policy.js'
import { classifyAuthority, independenceClusterForDomain, isOfficialUrl, makeSource, sourceFromKnownUrl } from './source-records.js'
import type {
  LeadRaisedEvent,
  SearchIntent,
  SuperSearchClaim,
  SuperSearchConvergence,
  SuperSearchMode,
  SuperSearchProof,
  SuperSearchResult,
  SuperSearchSourceRecord
} from './types.js'

const DEFAULT_FETCH = globalThis.fetch

export function normalizeGenericSourceRows(raw: unknown, providerId: string, family: string, intent: SearchIntent, tier: SuperSearchSourceRecord['authority_tier']): SuperSearchSourceRecord[] {
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
      verdict: 'weak_content',
      authority: tier,
      primary: providerId === 'context7',
      path: [providerId]
    })
  })
}

export async function materializeContext7SourceRows(
  raw: unknown,
  artifactDir: string,
  intent: SearchIntent
): Promise<SuperSearchSourceRecord[]> {
  const rows = Array.isArray(raw) ? raw : Array.isArray((raw as any)?.results) ? (raw as any).results : raw ? [raw] : []
  const out: SuperSearchSourceRecord[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const row: any = rows[index]
    const url = typeof row?.url === 'string' ? row.url : typeof row?.link === 'string' ? row.link : null
    const content = String(row?.content || row?.full_text || row?.document || row?.markdown || row?.text || row?.snippet || '')
    const visible = visibleEvidenceText(content)
    const meaningful = visible.length >= 80 && (visible.match(/[\p{L}\p{N}]{2,}/gu) || []).length >= 8
    const contentSha = meaningful ? sha256(content) : null
    const contentArtifact = contentSha ? path.join('context7-content', `${contentSha.slice(0, 16)}.txt`) : null
    if (contentArtifact) await writeTextAtomic(path.join(artifactDir, contentArtifact), content)
    out.push(makeSource({
      providerId: 'context7',
      family: 'official_docs',
      type: 'official_docs',
      title: String(row?.title || row?.name || `context7 result ${index + 1}`),
      url,
      snippet: String(row?.snippet || row?.summary || visible.slice(0, 500)),
      verdict: meaningful ? 'verified_content' : 'weak_content',
      authority: 'A0',
      primary: true,
      path: ['context7', ...(contentArtifact ? ['materialized_content'] : ['snippet_only'])],
      blockers: contentArtifact ? [] : ['context7_content_artifact_missing'],
      contentArtifact,
      contentSha256: contentSha,
      contentLength: meaningful ? content.length : null
    }))
  }
  return out
}

export function sourceFromWebRow(row: any, index: number, intent: SearchIntent): SuperSearchSourceRecord {
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

export async function sourceFromUrlFetch(url: string, artifactDir: string, intent: SearchIntent, opts: { allowLocal?: boolean; hardTimeoutMs?: number; deadlineEpochMs?: number } = {}): Promise<{
  source: SuperSearchSourceRecord
  blockers: string[]
  warnings: string[]
}> {
  const warnings: string[] = []
  const blockers: string[] = []
  const fetchFn = globalThis.fetch
  if (typeof fetchFn !== 'function') {
    blockers.push('direct_url_fetch_adapter_unavailable')
    return {
      source: { ...sourceFromKnownUrl(url, intent), blockers, warnings: ['url_parse_only'] },
      blockers,
      warnings
    }
  }
  const fetchTimeoutMs = boundedOperationTimeout(10_000, opts.hardTimeoutMs, opts.deadlineEpochMs)
  if (fetchTimeoutMs <= 0) {
    blockers.push('direct_url_fetch_deadline_exceeded')
    return {
      source: { ...sourceFromKnownUrl(url, intent), blockers, warnings: ['url_parse_only'] },
      blockers,
      warnings
    }
  }
  const policyOpts = {
    ...(opts.allowLocal === undefined ? {} : { allowLocal: opts.allowLocal }),
    networkLookupRequired: fetchFn === DEFAULT_FETCH
  }
  const initialPolicy = await evaluateUrlFetchPolicy(url, policyOpts)
  if (!initialPolicy.ok) {
    blockers.push(...initialPolicy.blockers)
    warnings.push(...initialPolicy.warnings)
    return {
      source: { ...sourceFromKnownUrl(url, intent), blockers, warnings: [...warnings, 'url_parse_only'] },
      blockers,
      warnings
    }
  }
  warnings.push(...initialPolicy.warnings)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), fetchTimeoutMs)
  try {
    let currentUrl = url
    let response: Response | null = null
    for (let redirectCount = 0; redirectCount <= 5; redirectCount++) {
      const policy = await evaluateUrlFetchPolicy(currentUrl, policyOpts)
      if (!policy.ok) {
        blockers.push(...policy.blockers)
        warnings.push(...policy.warnings)
        return {
          source: { ...sourceFromKnownUrl(currentUrl, intent), blockers, warnings: [...warnings, 'url_parse_only'] },
          blockers,
          warnings
        }
      }
      warnings.push(...policy.warnings)
      response = await fetchFn(currentUrl, {
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'user-agent': 'sneakoscope-super-search/5.10' }
      })
      if (![301, 302, 303, 307, 308].includes(response.status)) break
      const location = response.headers.get('location')
      if (!location) break
      currentUrl = new URL(location, response.url || currentUrl).toString()
      if (redirectCount === 5) blockers.push('direct_url_fetch_redirect_limit')
    }
    if (!response) throw new Error('direct URL fetch produced no response')
    const text = await response.text()
    const capped = text.length > 512 * 1024 ? text.slice(0, 512 * 1024) : text
    if (text.length > capped.length) warnings.push('url_content_truncated')
    const normalizedUrl = response.url || currentUrl
    const finalPolicy = await evaluateUrlFetchPolicy(normalizedUrl, policyOpts)
    if (!finalPolicy.ok) {
      blockers.push(...finalPolicy.blockers)
      warnings.push(...finalPolicy.warnings)
      return {
        source: { ...sourceFromKnownUrl(normalizedUrl, intent), blockers, warnings: [...warnings, 'url_parse_only'] },
        blockers,
        warnings
      }
    }
    warnings.push(...finalPolicy.warnings)
    if (!response.ok) blockers.push(`direct_url_fetch_http_${response.status}`)
    const contentInspection = inspectHydratedContent(capped, response.headers.get('content-type'))
    blockers.push(...contentInspection.blockers)
    warnings.push(...contentInspection.warnings)
    const verifiedContent = response.ok && contentInspection.ok
    const contentSha = verifiedContent ? sha256(capped) : null
    const relArtifact = contentSha ? path.join('url-content', `${contentSha.slice(0, 16)}.txt`) : null
    if (relArtifact) await writeTextAtomic(path.join(artifactDir, relArtifact), capped)
    const source = makeSource({
      providerId: 'direct_url',
      family: intent === 'x_specific' ? 'social' : 'web',
      type: 'known_url',
      title: normalizedUrl,
      url: normalizedUrl,
      snippet: contentInspection.visible_text.slice(0, 500),
      verdict: verifiedContent ? 'verified_content' : 'blocked',
      authority: classifyAuthority(normalizedUrl),
      primary: isOfficialUrl(normalizedUrl),
      path: opts.allowLocal ? ['direct_url_fetch', 'allow_local'] : ['direct_url_fetch'],
      warnings,
      blockers,
      contentArtifact: relArtifact,
      contentSha256: contentSha,
      contentLength: verifiedContent ? capped.length : null
    })
    return { source, blockers, warnings }
  } catch (error) {
    const reason = error instanceof Error && error.name === 'AbortError' ? 'direct_url_fetch_timeout' : 'direct_url_fetch_failed'
    blockers.push(reason)
    warnings.push(error instanceof Error ? error.message : String(error))
    return {
      source: { ...sourceFromKnownUrl(url, intent), blockers, warnings: [...warnings, 'url_parse_only'] },
      blockers,
      warnings
    }
  } finally {
    clearTimeout(timer)
  }
}

function boundedOperationTimeout(fallbackMs: number, hardTimeoutMs: unknown, deadlineEpochMs: unknown): number {
  const hard = Number(hardTimeoutMs)
  const deadline = Number(deadlineEpochMs)
  const remaining = Number.isFinite(deadline) && deadline > 0 ? Math.floor(deadline - Date.now()) : Number.POSITIVE_INFINITY
  if (remaining <= 0) return 0
  return Math.max(1, Math.floor(Math.min(
    fallbackMs,
    Number.isFinite(hard) && hard > 0 ? hard : Number.POSITIVE_INFINITY,
    remaining
  )))
}

export function inspectHydratedContent(raw: unknown, contentTypeValue: unknown): {
  ok: boolean
  visible_text: string
  blockers: string[]
  warnings: string[]
} {
  const body = String(raw || '')
  const contentType = String(contentTypeValue || '').split(';')[0]!.trim().toLowerCase()
  const blockers: string[] = []
  const warnings: string[] = []
  if (contentType && !isTextualEvidenceContentType(contentType)) {
    blockers.push(`direct_url_fetch_unsupported_content_type:${contentType}`)
  }
  const visibleText = visibleEvidenceText(body)
  if (!body.trim()) blockers.push('direct_url_fetch_empty_content')
  if (looksLikeAuthenticationOrChallenge(body, visibleText)) blockers.push('direct_url_fetch_auth_or_challenge_content')
  if (looksLikeSoftError(body, visibleText)) blockers.push('direct_url_fetch_error_or_soft_404_content')
  const tokens = visibleText.match(/[\p{L}\p{N}]{2,}/gu) || []
  if (visibleText.length < 80 || tokens.length < 8) blockers.push('direct_url_fetch_non_meaningful_content')
  if (!contentType) blockers.push('direct_url_fetch_content_type_missing')
  return {
    ok: blockers.length === 0,
    visible_text: visibleText,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)]
  }
}

function isTextualEvidenceContentType(contentType: string): boolean {
  return contentType.startsWith('text/')
    || contentType === 'application/json'
    || contentType === 'application/ld+json'
    || contentType === 'application/xml'
    || contentType === 'application/xhtml+xml'
    || contentType.endsWith('+json')
    || contentType.endsWith('+xml')
}

function visibleEvidenceText(body: string): string {
  return body
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(?:nbsp|amp|quot|apos|lt|gt);/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function looksLikeAuthenticationOrChallenge(body: string, visibleText: string): boolean {
  const prefix = `${body.slice(0, 12000)}\n${visibleText.slice(0, 2000)}`
  const structuralLogin = /<form\b[^>]*(?:login|signin|sign-in)|<input\b[^>]*type\s*=\s*["']?password/i.test(prefix)
  const challenge = /\b(?:verify (?:that )?you are human|checking your browser|attention required|captcha|cloudflare ray id|bot (?:check|challenge|detection)|enable javascript and cookies to continue)\b/i.test(prefix)
  const shortAuthenticationShell = visibleText.length < 1200
    && /\b(?:sign in|log in|login required|authentication required|access denied|unauthorized)\b/i.test(prefix)
  return structuralLogin || challenge || shortAuthenticationShell
}

function looksLikeSoftError(body: string, visibleText: string): boolean {
  const prefix = `${body.slice(0, 8000)}\n${visibleText.slice(0, 1600)}`
  return /<title[^>]*>\s*(?:404|not found|page not found|error|service unavailable|internal server error|bad gateway)\b/i.test(prefix)
    || /\b(?:404\s+(?:error|not found)|page not found|the page you (?:requested|are looking for) (?:was not found|does not exist)|this page (?:does not|doesn't) exist|soft 404|service unavailable|internal server error|bad gateway)\b/i.test(prefix)
    || /(?:페이지를\s*찾을\s*수\s*없|요청한\s*페이지가\s*없|서비스를\s*사용할\s*수\s*없|내부\s*서버\s*오류)/i.test(prefix)
}

async function evaluateUrlFetchPolicy(rawUrl: string, opts: { allowLocal?: boolean; networkLookupRequired?: boolean }): Promise<{ ok: boolean; blockers: string[]; warnings: string[] }> {
  if (opts.allowLocal === true) return { ok: true, blockers: [], warnings: ['local_fetch_explicitly_allowed'] }
  const warnings: string[] = []
  try {
    const parsed = new URL(rawUrl)
    if (!/^https?:$/i.test(parsed.protocol)) {
      return { ok: false, blockers: ['direct_url_fetch_protocol_not_allowed'], warnings }
    }
    const host = parsed.hostname.toLowerCase()
    if (host === 'localhost' || host.endsWith('.localhost')) {
      return { ok: false, blockers: ['direct_url_fetch_ssrf_blocked:localhost'], warnings }
    }
    const literal = normalizeIpLiteral(host)
    if (!literal && opts.networkLookupRequired === false) {
      return { ok: true, blockers: [], warnings: ['direct_url_fetch_dns_probe_skipped_for_injected_fetch'] }
    }
    const addresses = literal
      ? [literal]
      : (await dns.lookup(host, { all: true, verbatim: true })).map((entry) => entry.address)
    const blocked = addresses.find((address) => isPrivateOrLocalAddress(address))
    if (blocked) {
      return { ok: false, blockers: [`direct_url_fetch_ssrf_blocked:${blocked}`], warnings }
    }
    return { ok: true, blockers: [], warnings }
  } catch (error) {
    warnings.push(`direct_url_fetch_policy_check_failed:${error instanceof Error ? error.message : String(error)}`)
    return { ok: false, blockers: ['direct_url_fetch_policy_check_failed'], warnings }
  }
}

function normalizeIpLiteral(hostname: string): string | null {
  const unwrapped = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  return net.isIP(unwrapped) ? unwrapped : null
}

function isPrivateOrLocalAddress(address: string): boolean {
  const normalized = normalizeIpLiteral(address) || address
  if (net.isIP(normalized) === 4) {
    const parts = normalized.split('.').map((part) => Number(part))
    const a = parts[0] ?? -1
    const b = parts[1] ?? -1
    return a === 10
      || a === 127
      || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168)
      || (a === 169 && b === 254)
      || a === 0
  }
  if (net.isIP(normalized) === 6) {
    const lower = normalized.toLowerCase()
    return lower === '::1'
      || lower.startsWith('fc')
      || lower.startsWith('fd')
      || lower.startsWith('fe80:')
      || lower === '::'
      || lower.startsWith('::ffff:127.')
      || lower.startsWith('::ffff:10.')
      || lower.startsWith('::ffff:192.168.')
  }
  return false
}

export function buildXDiscoverySources(queries: string[], intent: SearchIntent): SuperSearchSourceRecord[] {
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

export function dedupeSources(sources: SuperSearchSourceRecord[]): SuperSearchSourceRecord[] {
  const clusters = new Map<string, SuperSearchSourceRecord[]>()
  for (const source of sources) {
    const key = source.canonical_url || source.content_sha256 || source.source_id
    const rows = clusters.get(key) || []
    rows.push(source)
    clusters.set(key, rows)
  }
  return [...clusters.values()].map((rows) => {
    const ranked = [...rows].sort((a, b) => sourceRank(b) - sourceRank(a))
    const selected = ranked[0]!
    return {
      ...selected,
      duplicate_cluster_id: selected.source_id,
      acquisition_path: [...new Set(rows.flatMap((row) => row.acquisition_path || []))],
      warnings: [...new Set(rows.flatMap((row) => row.warnings || []))],
      blockers: selected.acquisition_verdict === 'verified_content'
        ? []
        : [...new Set(rows.flatMap((row) => row.blockers || []))]
    }
  })
}

function sourceRank(source: SuperSearchSourceRecord): number {
  const verdict = source.acquisition_verdict === 'verified_content'
    ? 5
    : source.acquisition_verdict === 'partial_content'
      ? 3
      : source.acquisition_verdict === 'weak_content'
        ? 2
        : 0
  return verdict * 100 + source.trust_score * 10 + source.relevance_score
}

export function buildLeads(sources: SuperSearchSourceRecord[], mode: SuperSearchMode): LeadRaisedEvent[] {
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

export function buildClaims(query: string, sources: SuperSearchSourceRecord[], mode: SuperSearchMode, intent: SearchIntent): SuperSearchClaim[] {
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

export function buildConvergence(mode: SuperSearchMode, leads: LeadRaisedEvent[], blockers: string[]): SuperSearchConvergence {
  const minimum = mode === 'deep' || mode === 'exhaustive' ? 2 : 1
  const waves = mode === 'deep' || mode === 'exhaustive' ? 2 : 1
  const open = leads.filter((lead) => lead.kind !== 'dead_end').length
  return {
    schema: 'sks.super-search-convergence.v1',
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

export function buildProof(
  mode: SuperSearchMode,
  intent: SearchIntent,
  sources: SuperSearchSourceRecord[],
  claims: SuperSearchClaim[],
  convergence: SuperSearchConvergence,
  blockers: string[],
  warnings: string[]
): SuperSearchProof {
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
  const realEvidencePolicy = evaluateRealEvidencePolicy({
    productionMode: true,
    mode,
    sources,
    claims,
    proof: {
      verified_source_count: sources.filter((source) => source.acquisition_verdict === 'verified_content').length,
      mock_only: false
    }
  })
  proofBlockers.push(...realEvidencePolicy.blockers)
  warnings.push(...realEvidencePolicy.warnings)
  const verifiedSources = sources.filter((source) => source.acquisition_verdict === 'verified_content')
  const verifiedProviderIds = [...new Set(verifiedSources
    .map((source) => String(source.provider_id || '').trim())
    .filter(Boolean))]
  const verifiedProviderFamilies = [...new Set(verifiedSources
    .map((source) => String(source.source_family || '').trim().toLowerCase())
    .filter(Boolean))]
  const verifiedIndependenceClusters = [...new Set(verifiedSources
    .map((source) => String(source.independence_cluster_id || independenceClusterForDomain(source.domain) || '').trim().toLowerCase())
    .filter(Boolean))]
  const providerIndependent = verifiedProviderFamilies.length >= 2 && verifiedIndependenceClusters.length >= 2
  return {
    schema: 'sks.super-search-proof.v1',
    ok: proofBlockers.length === 0,
    mode,
    intent,
    provider_independent: providerIndependent,
    provider_independence_basis: 'distinct_verified_provider_families_and_independence_clusters',
    verified_provider_count: verifiedProviderIds.length,
    verified_provider_ids: verifiedProviderIds,
    verified_provider_family_count: verifiedProviderFamilies.length,
    verified_provider_families: verifiedProviderFamilies,
    verified_independence_cluster_count: verifiedIndependenceClusters.length,
    verified_independence_clusters: verifiedIndependenceClusters,
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

export function renderSynthesis(query: string, sources: SuperSearchSourceRecord[], claims: SuperSearchClaim[], proof: SuperSearchProof): string {
  const usable = claims.filter((claim) => claim.status === 'verified' || (claim.status === 'supported' && claim.risk !== 'high'))
  return [
    '# Super-Search Synthesis',
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

export function buildAttemptLedger(
  providerPlan: SuperSearchResult['provider_plan'],
  mode: SuperSearchMode,
  blockers: string[],
  warnings: string[]
): SuperSearchResult['attempt_ledger'] {
  const attempts: SuperSearchResult['attempt_ledger']['attempts'] = []
  const hasBlocker = (id: string) => blockers.includes(id)
  const hasWarning = (id: string) => warnings.includes(id)
  if (providerPlan.selected_providers.includes('context7')) {
    attempts.push({ id: 'attempt-001', strategy: 'context7-official-docs', status: 'completed', reason: 'provider_bound', next_strategy: null })
  } else if (hasWarning('context7_docs_provider_not_bound') || hasWarning('context7_not_invoked_for_docs_query')) {
    attempts.push({ id: 'attempt-001', strategy: 'context7-official-docs', status: 'skipped', reason: 'runtime_adapter_unavailable', next_strategy: 'codex-web-search' })
  }
  if (providerPlan.selected_providers.includes('codex_web')) {
    attempts.push({ id: `attempt-${String(attempts.length + 1).padStart(3, '0')}`, strategy: 'codex-web-search', status: 'completed', reason: 'provider_bound', next_strategy: null })
  } else if (hasWarning('codex_web_search_not_bound_or_unverified') || hasBlocker('source_acquisition_unavailable')) {
    attempts.push({ id: `attempt-${String(attempts.length + 1).padStart(3, '0')}`, strategy: 'codex-web-search', status: 'failed', reason: 'runtime_adapter_unavailable', next_strategy: mode === 'url_acquisition' ? 'direct-url-acquisition' : null })
  }
  if (mode === 'url_acquisition') {
    attempts.push({
      id: `attempt-${String(attempts.length + 1).padStart(3, '0')}`,
      strategy: 'direct-url-acquisition',
      status: hasBlocker('missing_url_for_super_search_fetch') ? 'blocked' : 'completed',
      reason: hasBlocker('missing_url_for_super_search_fetch') ? 'missing_url_for_super_search_fetch' : 'url_present',
      next_strategy: null
    })
  }
  if (mode === 'x_search') {
    attempts.push({
      id: `attempt-${String(attempts.length + 1).padStart(3, '0')}`,
      strategy: 'x-public-discovery',
      status: hasBlocker('x_search_parity_not_proven') ? 'blocked' : 'completed',
      reason: hasBlocker('x_search_parity_not_proven') ? 'discovery_only_without_verified_detail' : 'discovery_completed',
      next_strategy: null
    })
  }
  const failedByStrategy = attempts.reduce<Map<string, number>>((map, attempt) => {
    map.set(attempt.strategy, (map.get(attempt.strategy) || 0) + (attempt.status === 'failed' ? 1 : 0))
    return map
  }, new Map<string, number>())
  return {
    schema: 'sks.attempt-ledger.v1',
    attempts,
    repeated_failed_strategy_count: [...failedByStrategy.values()].filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0)
  }
}

export function extractFirstUrl(text: string): string | null {
  return text.match(/https?:\/\/[^\s)"']+/i)?.[0] || null
}

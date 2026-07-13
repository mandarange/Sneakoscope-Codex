import { nowIso, sha256 } from '../fsx.js'
import type { AcquisitionVerdict, SearchIntent, SuperSearchSourceRecord } from './types.js'

export function sourceFromKnownUrl(url: string, intent: SearchIntent): SuperSearchSourceRecord {
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

export function makeSource(opts: {
  providerId: string
  family: string
  type: string
  title: string
  url: string | null
  snippet: string
  verdict: AcquisitionVerdict
  authority: SuperSearchSourceRecord['authority_tier']
  primary: boolean
  path: string[]
  warnings?: string[]
  blockers?: string[]
  contentArtifact?: string | null
  contentSha256?: string | null
  contentLength?: number | null
}): SuperSearchSourceRecord {
  const now = nowIso()
  const canonical = opts.url ? canonicalizeUrl(opts.url) : null
  const domain = canonical ? safeDomain(canonical) : null
  const verifiedArtifact = Boolean(opts.contentArtifact)
    && /^[a-f0-9]{32,}$/i.test(String(opts.contentSha256 || ''))
    && Number(opts.contentLength || 0) > 0
  const requestedVerified = opts.verdict === 'verified_content'
  const verdict: AcquisitionVerdict = requestedVerified && !verifiedArtifact ? 'weak_content' : opts.verdict
  const verified = verdict === 'verified_content'
  const blockers = [
    ...(opts.blockers || []),
    ...(requestedVerified && !verifiedArtifact ? ['verified_content_artifact_missing'] : [])
  ]
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
    content_artifact: opts.contentArtifact ?? null,
    content_sha256: opts.contentSha256 ?? null,
    content_length: opts.contentLength ?? null,
    acquisition_verdict: verdict,
    acquisition_path: opts.path,
    authority_tier: opts.authority,
    freshness_score: 0.5,
    relevance_score: 0.6,
    trust_score: verified ? 0.9 : verdict === 'weak_content' ? 0.55 : 0.35,
    primary_source: opts.primary,
    authenticated_source: false,
    local_only_raw: false,
    duplicate_cluster_id: null,
    independence_cluster_id: independenceClusterForDomain(domain) || opts.providerId,
    warnings: opts.warnings || [],
    blockers
  }
}

export function independenceClusterForDomain(value: string | null): string | null {
  const host = String(value || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '')
  if (!host) return null
  const ownership = knownOwnershipCluster(host)
  if (ownership) return ownership
  const labels = host.split('.').filter(Boolean)
  if (labels.length <= 2) return host
  const publicSuffix = labels.slice(-2).join('.')
  const multiLabelSuffixes = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au',
    'co.jp', 'ne.jp', 'or.jp', 'com.br', 'com.cn', 'com.sg', 'co.kr', 'co.nz'
  ])
  return multiLabelSuffixes.has(publicSuffix)
    ? labels.slice(-3).join('.')
    : labels.slice(-2).join('.')
}

function knownOwnershipCluster(host: string): string | null {
  const groups: Array<[string, string[]]> = [
    ['owner:openai', ['openai.com', 'chatgpt.com']],
    ['owner:x', ['x.com', 'twitter.com']],
    ['owner:github', ['github.com', 'githubusercontent.com', 'githubassets.com']],
    ['owner:google', ['google.com', 'youtube.com', 'googleusercontent.com']],
    ['owner:microsoft', ['microsoft.com', 'azure.com', 'visualstudio.com']]
  ]
  for (const [cluster, domains] of groups) {
    if (domains.some((domain) => host === domain || host.endsWith(`.${domain}`))) return cluster
  }
  return null
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

export function isOfficialUrl(raw: string | null): boolean {
  if (!raw) return false
  const domain = safeDomain(raw)
  return Boolean(domain && /(docs\.|developer|github\.com|npmjs\.com|nodejs\.org|w3\.org|ietf\.org|gov$|\.gov$)/i.test(domain))
}

export function classifyAuthority(raw: string | null): SuperSearchSourceRecord['authority_tier'] {
  if (!raw) return 'E'
  if (isOfficialUrl(raw)) return 'A0'
  const domain = safeDomain(raw)
  if (domain && /(github\.com|npmjs\.com|arxiv\.org|doi\.org)/i.test(domain)) return 'A1'
  if (domain && /(x\.com|twitter\.com|reddit\.com|news\.ycombinator\.com)/i.test(domain)) return 'D'
  return 'C'
}

import {
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  managedOfficialSubagentRoleByName,
  type ManagedOfficialSubagentRole
} from '../managed-assets/managed-assets-manifest.js'

export const DEFAULT_AUTOMATIC_SUBAGENT_COUNT = 2
export const MAX_AUTOMATIC_SUBAGENT_COUNT = 3
export const MAX_AUTOMATIC_REVIEWER_COUNT = 2
export const MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT = MAX_AUTOMATIC_SUBAGENT_COUNT

export interface OfficialSubagentRoleSummary {
  name: string
  description: string
  model: string
  model_reasoning_effort: 'max'
  sandbox_mode: 'inherit' | 'read-only' | 'workspace-write'
}

export function officialSubagentRoleCatalog(): OfficialSubagentRoleSummary[] {
  return MANAGED_OFFICIAL_SUBAGENT_ROLES.map(roleSummary)
}

export function officialSubagentOnDemandRoleCatalog(roleNames: readonly string[]): OfficialSubagentRoleSummary[] {
  const selected: ManagedOfficialSubagentRole[] = []
  const seen = new Set<string>()
  for (const name of roleNames) {
    const role = managedOfficialSubagentRoleByName(String(name || ''))
    if (!role || seen.has(role.codex_name)) continue
    seen.add(role.codex_name)
    selected.push(role)
    if (selected.length >= MAX_ON_DEMAND_SUBAGENT_ROLE_COUNT) break
  }
  return selected.map(roleSummary)
}

export function officialSubagentOnDemandRolePlan(
  roleNames: readonly string[]
): Record<string, Omit<OfficialSubagentRoleSummary, 'name'>> {
  return Object.fromEntries(officialSubagentOnDemandRoleCatalog(roleNames).map(({ name, ...config }) => [name, config]))
}

function roleSummary(role: ManagedOfficialSubagentRole): OfficialSubagentRoleSummary {
  return {
    name: role.codex_name,
    description: role.description,
    model: role.model,
    model_reasoning_effort: role.model_reasoning_effort,
    sandbox_mode: role.sandbox || 'inherit'
  }
}

export function officialSubagentRolePlan(): Record<string, Omit<OfficialSubagentRoleSummary, 'name'>> {
  return Object.fromEntries(officialSubagentRoleCatalog().map(({ name, ...config }) => [name, config]))
}

export function recommendOfficialSubagentRoles(input: {
  title?: string | null
  description?: string | null
  role?: string | null
  expectedOutput?: string | null
  paths?: readonly string[] | null
  readOnly?: boolean
  requiresWrite?: boolean
  limit?: number
} = {}): string[] {
  const text = normalizeText([
    input.title,
    input.description,
    input.role,
    input.expectedOutput,
    ...(input.paths || [])
  ])
  const limit = clamp(input.limit ?? MAX_AUTOMATIC_SUBAGENT_COUNT, 1, MAX_AUTOMATIC_SUBAGENT_COUNT)
  const scored = MANAGED_OFFICIAL_SUBAGENT_ROLES
    .map((role, index) => ({ role, index, score: roleScore(role, text, input) }))
    .filter((row) => input.readOnly !== true || row.role.sandbox === 'read-only')
  const solSpecialistMatched = scored.some((row) => row.score > 0
    && row.role.model === 'gpt-5.6-sol'
    && !['worker', 'expert'].includes(row.role.codex_name))
  const ranked = scored
    .filter((row) => !(solSpecialistMatched && row.role.codex_name === 'worker'))
    .filter((row) => row.score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((row) => row.role.codex_name)

  if (ranked.length) return unique(ranked).slice(0, limit)
  if (input.readOnly === true) return ['expert']
  if (looksClearBounded(text)) return ['worker']
  return [input.requiresWrite === true ? 'implementation_specialist' : 'expert']
}

export function selectOfficialSubagentRole(input: Parameters<typeof recommendOfficialSubagentRoles>[0] = {}): string {
  return recommendOfficialSubagentRoles({ ...input, limit: 1 })[0] || 'expert'
}

export function officialSubagentFanoutPolicy(input: {
  requestedSubagents?: number | null
  requestedExplicit?: boolean
  requestedSource?: 'operator' | 'route_contract' | 'automatic'
  taskProfile?: string | null
  suggestedRoles?: readonly string[] | null
  goal?: string | null
} = {}) {
  const countSource = input.requestedSource === 'route_contract'
    ? 'route_contract'
    : input.requestedExplicit === true || input.requestedSource === 'operator'
      ? 'operator'
      : 'automatic'
  const explicit = countSource !== 'automatic'
  const explicitRequested = Number.isFinite(Number(input.requestedSubagents))
    ? Math.max(1, Math.floor(Number(input.requestedSubagents)))
    : DEFAULT_AUTOMATIC_SUBAGENT_COUNT
  const automatic = automaticSubagentFanout({
    ...(input.taskProfile === undefined ? {} : { taskProfile: input.taskProfile }),
    ...(input.goal === undefined ? {} : { goal: input.goal }),
    ...(input.suggestedRoles === undefined ? {} : { suggestedRoles: input.suggestedRoles })
  })
  const requested = explicit ? explicitRequested : automatic.count
  const automaticReviewerCeiling = automatic.criticalMultiDomain
    ? MAX_AUTOMATIC_SUBAGENT_COUNT
    : MAX_AUTOMATIC_REVIEWER_COUNT
  return {
    mode: countSource === 'operator'
      ? 'explicit_operator_count'
      : countSource === 'route_contract'
        ? 'route_owned_contract_count'
        : 'parent_owned_risk_based',
    count_source: countSource,
    requested_subagents: requested,
    default_subagents: DEFAULT_AUTOMATIC_SUBAGENT_COUNT,
    automatic_selected: explicit ? null : automatic.count,
    automatic_ceiling: automatic.ceiling,
    automatic_reviewer_ceiling: automaticReviewerCeiling,
    selection_reason: countSource === 'operator'
      ? 'explicit_operator_count_preserved'
      : countSource === 'route_contract'
        ? 'route_owned_contract_count_preserved'
        : automatic.reason,
    risk_domains: automatic.riskDomains,
    critical_multi_domain: automatic.criticalMultiDomain,
    requires_independent_non_overlapping_slices: true,
    suggested_agents: unique((input.suggestedRoles || []).map(String)).slice(0, MAX_AUTOMATIC_SUBAGENT_COUNT)
  }
}

function automaticSubagentFanout(input: {
  taskProfile?: string | null
  goal?: string | null
  suggestedRoles?: readonly string[] | null
}) {
  const text = normalizeText([input.goal])
  const riskDomains = unique([
    ...riskDomainsFromText(text),
    ...riskDomainsFromRoles(input.suggestedRoles || [])
  ])
  const parallel = input.taskProfile === 'parallel-read' || input.taskProfile === 'parallel-write'
  const highRisk = input.taskProfile === 'high-risk'
  const critical = CRITICAL_RISK_RE.test(text)
  const criticalMultiDomain = highRisk && critical && riskDomains.length >= 3

  if (criticalMultiDomain) {
    return {
      count: MAX_AUTOMATIC_SUBAGENT_COUNT,
      ceiling: MAX_AUTOMATIC_SUBAGENT_COUNT,
      reason: 'critical_multi_domain_risk',
      riskDomains,
      criticalMultiDomain: true
    }
  }
  if (parallel) {
    return {
      count: 2,
      ceiling: 2,
      reason: 'explicit_parallel_or_independent_slices',
      riskDomains,
      criticalMultiDomain: false
    }
  }
  if (highRisk && riskDomains.length >= 2) {
    return {
      count: 2,
      ceiling: 2,
      reason: 'independent_multi_domain_risk',
      riskDomains,
      criticalMultiDomain: false
    }
  }
  return {
    count: DEFAULT_AUTOMATIC_SUBAGENT_COUNT,
    ceiling: DEFAULT_AUTOMATIC_SUBAGENT_COUNT,
    reason: 'non_trivial_default_parallel',
    riskDomains,
    criticalMultiDomain: false
  }
}

function riskDomainsFromText(text: string): string[] {
  const domains: string[] = []
  for (const [domain, pattern] of RISK_DOMAIN_PATTERNS) {
    if (pattern.test(text)) domains.push(domain)
  }
  return domains
}

function riskDomainsFromRoles(roles: readonly string[]): string[] {
  return roles
    .map((role) => ROLE_RISK_DOMAINS[String(role || '').trim()] || null)
    .filter((domain): domain is string => Boolean(domain))
}

function roleScore(
  role: ManagedOfficialSubagentRole,
  text: string,
  input: { readOnly?: boolean; requiresWrite?: boolean }
): number {
  const semanticScore = [...role.selection_keywords, ...(ROLE_LANGUAGE_HINTS[role.codex_name] || [])]
    .reduce((total, keyword) => total + keywordScore(text, keyword), 0)
  if (semanticScore <= 0) return 0
  let score = semanticScore
  if (input.readOnly === true) score += role.sandbox === 'read-only' ? 2 : role.sandbox ? -3 : 0
  if (input.requiresWrite === true) score += role.sandbox === 'read-only' ? -3 : role.sandbox === 'workspace-write' ? 2 : 1
  if (role.codex_name === 'worker' && !looksClearBounded(text)) score -= 4
  if (role.codex_name === 'expert') score -= 1
  return score
}

function keywordScore(text: string, keyword: string): number {
  const normalized = normalizeText([keyword])
  if (!normalized) return 0
  const matched = /^[a-z0-9]+$/i.test(normalized)
    ? new RegExp(`(?:^|\\b)${escapeRegExp(normalized)}(?:\\b|$)`, 'i').test(text)
    : text.includes(normalized)
  if (!matched) return 0
  return normalized.includes(' ') ? 4 : 3
}

function looksClearBounded(text: string): boolean {
  return /\b(bounded|mechanical|repeatable|exact|single[- ](?:file|step|change)|rename|format|copy|fixture)\b|정해진|명확한|기계적|반복적|단일\s*파일/i.test(text)
}

function normalizeText(values: readonly unknown[]): string {
  return values
    .map((value) => String(value || '').normalize('NFKC').toLowerCase())
    .join(' ')
    .replace(/[_/\\.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.floor(Number(value) || minimum)))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const ROLE_LANGUAGE_HINTS: Record<string, string[]> = {
  worker: ['기계적', '반복적', '단순 변경', '정확한 변경'],
  implementation_specialist: ['구현', '기능 추가', '핵심 로직', '백엔드', '복잡한 변경'],
  expert: ['모호', '전략', '판단', '트레이드오프'],
  explorer: ['탐색', '찾아', '추적', '인벤토리', '구조 파악'],
  debugger: ['디버깅', '원인', '실패', '재현', '회귀'],
  test_engineer: ['테스트', '회귀 테스트', '검증', '픽스처', '커버리지'],
  ui_implementer: ['화면', '터미널', '젤리', '패널', '팬', '레이아웃', '사용성'],
  native_app_specialist: ['네이티브 앱', '메뉴바', '앱킷', '스위프트', '맥os', '데스크톱', 'tcc'],
  toolchain_specialist: ['툴체인', '의존성', '패키지 매니저', '빌드', '설치', '닥터', '업데이트', 'ci 자동화'],
  protocol_reviewer: ['프로토콜', '계약', '스키마', '직렬화', 'api', 'sdk', 'cli', 'mcp', '하위 호환'],
  runtime_reliability_reviewer: ['런타임 신뢰성', '훅', '세션', '락', '데몬', '프로세스 정리', '멱등성', '복구', '경쟁 상태', '교착'],
  triwiki_evidence_reviewer: ['트라이위키', '컨텍스트 팩', '출처', '신뢰 앵커', '증거', '증명', 'wrongness', '소스 하이드레이션'],
  architecture_reviewer: ['아키텍처', '설계', '수명주기', '결합도', '리팩터'],
  security_reviewer: ['보안', '권한', '인증', '비밀', '신뢰 경계'],
  database_reviewer: ['데이터베이스', '디비', '마이그레이션', '롤백', '스키마'],
  research_synthesizer: ['연구', '논문', '가설', '종합', '새로움'],
  research_reviewer: ['논문 검토', '적대적 평가', '방법론', '재현성', '반증'],
  release_reviewer: ['배포', '릴리스', '출시', '퍼블리시', '버전'],
  docs_maintainer: ['문서', '리드미', '변경로그', '마이그레이션 가이드'],
  integration_reviewer: ['통합', '병합', '리베이스', '호환성', '엔드투엔드'],
  performance_analyst: ['성능', '지연', '벤치마크', '동시성', '토큰', '메모리']
}

const CRITICAL_RISK_RE = /\b(?:critical|catastrophic|production|data loss|security incident|breaking release)\b|치명|중대|운영|데이터\s*손실|보안\s*사고/i

const RISK_DOMAIN_PATTERNS: readonly (readonly [string, RegExp])[] = [
  ['database', /\b(?:database|db|sql|postgres|supabase|migration|rls)\b|데이터베이스|디비|마이그레이션/i],
  ['security', /\b(?:security|permission|auth|authentication|secret|trust boundary)\b|보안|권한|인증|비밀|신뢰\s*경계/i],
  ['release', /\b(?:release|publish|deploy|distribution|package registry|production rollout)\b|릴리스|배포|출시|퍼블리시/i],
  ['payment', /\b(?:payment|billing|checkout|transaction)\b|결제|청구|트랜잭션/i],
  ['performance', /\b(?:performance|latency|throughput|concurrency|resource usage)\b|성능|지연|처리량|동시성/i],
  ['integration', /\b(?:integration|compatibility|cross-module|end-to-end)\b|통합|호환성|엔드투엔드/i],
  ['protocol', /\b(?:protocol|mcp|sdk|api contract|schema|serialization|wire format)\b|프로토콜|계약|스키마|직렬화/i],
  ['runtime', /\b(?:hook|session|lock|daemon|process cleanup|idempotency|recovery|race condition|deadlock)\b|훅|세션|락|데몬|프로세스\s*정리|멱등성|복구|경쟁\s*상태|교착/i],
  ['toolchain', /\b(?:toolchain|dependency upgrade|runtime upgrade|package manager|build script|install flow|doctor flow|update flow|ci automation)\b|툴체인|의존성|패키지\s*매니저|빌드|설치|닥터|업데이트/i],
  ['evidence', /\b(?:triwiki|context pack|provenance|trust anchor|proof artifact|wrongness memory)\b|트라이위키|컨텍스트\s*팩|출처|신뢰\s*앵커|증거|증명/i]
]

const ROLE_RISK_DOMAINS: Readonly<Record<string, string>> = {
  security_reviewer: 'security',
  database_reviewer: 'database',
  release_reviewer: 'release',
  performance_analyst: 'performance',
  integration_reviewer: 'integration',
  protocol_reviewer: 'protocol',
  runtime_reliability_reviewer: 'runtime',
  toolchain_specialist: 'toolchain',
  triwiki_evidence_reviewer: 'evidence'
}

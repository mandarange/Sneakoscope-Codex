import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import type { CodexWebSearchCapability } from '../codex/codex-web-search-adapter.js'

export const SOURCE_INTELLIGENCE_POLICY_SCHEMA = 'sks.source-intelligence-policy.v2'

export type SourceIntelligenceMode =
  | 'ultra_fast'
  | 'ultra_balanced'
  | 'ultra_deep'
  | 'ultra_exhaustive'
  | 'url_acquisition'
  | 'x_search'
  | 'offline_cache'
  | 'blocked'

export interface SourceIntelligencePolicy {
  schema: typeof SOURCE_INTELLIGENCE_POLICY_SCHEMA
  generated_at: string
  ok: boolean
  route: string
  mode: SourceIntelligenceMode
  requirements: {
    official_sources: boolean
    full_content: boolean
    counter_search: boolean
    claim_ledger: boolean
    social_recency: boolean
    code_execution_verification: boolean
  }
  capabilities: {
    docs: string[]
    web_search: string[]
    repo_search: string[]
    social: string[]
    browser: string[]
  }
  selected_providers: string[]
  context7: {
    required: boolean
    available: boolean
    status: 'available' | 'missing' | 'offline_only' | 'not_required'
  }
  codex_web_search: {
    required: boolean
    available: boolean
    status: CodexWebSearchCapability['status']
    reason: string | null
  }
  wrongness_kinds: string[]
  blockers: string[]
  warnings: string[]
}

export function buildSourceIntelligencePolicy(input: {
  route?: string
  offline?: boolean
  context7Available?: boolean
  codexWebCapability?: CodexWebSearchCapability
  query?: string
  mode?: SourceIntelligenceMode
  xaiDetection?: unknown
} = {}): SourceIntelligencePolicy {
  const route = input.route || 'unknown'
  const offline = input.offline === true
  const query = input.query || ''
  const docsIntent = /\b(package|npm|SDK|API|MCP|framework|library|docs?|문서|React|Next\.js|Prisma|Tailwind)\b/i.test(query)
  const xIntent = /\b(?:x\.com|twitter\.com|X\/Twitter|트위터|엑스|site:x\.com|site:twitter\.com)\b/i.test(query)
  const urlIntent = /https?:\/\/[^\s)"']+/i.test(query)
  const context7Available = input.context7Available !== false
  const codex = input.codexWebCapability || {
    schema: 'sks.codex-web-search-capability.v1',
    available: false,
    status: 'degraded_unverified' as const,
    reason: 'capability_not_checked'
  }
  const blockers: string[] = []
  const warnings: string[] = []
  const wrongnessKinds: string[] = []

  if (docsIntent && !context7Available) {
    blockers.push('docs_context_missing')
    wrongnessKinds.push('context7_missing')
  }
  if (!offline && codex.status === 'unavailable') {
    warnings.push('codex_web_search_unavailable_degraded_to_ultra_cache_or_docs')
    wrongnessKinds.push('codex_web_search_missing')
  }
  if (input.xaiDetection) warnings.push('xai_detection_input_ignored_by_source_intelligence_v2')

  const mode: SourceIntelligenceMode = input.mode || (!context7Available && docsIntent
    ? 'blocked'
    : offline
      ? 'offline_cache'
      : urlIntent
        ? 'url_acquisition'
        : xIntent
          ? 'x_search'
          : /deep|exhaustive|가능한 전부|누락 없이|완벽하게 조사/i.test(query)
            ? 'ultra_deep'
            : 'ultra_balanced')

  const selected = new Set<string>()
  if (docsIntent && context7Available) selected.add('context7')
  if (!offline && codex.status !== 'unavailable') selected.add('codex_web')
  if (xIntent || mode === 'x_search') selected.add('x_public')
  if (offline) selected.add('offline_cache')

  return {
    schema: SOURCE_INTELLIGENCE_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route,
    mode,
    requirements: {
      official_sources: docsIntent,
      full_content: mode !== 'ultra_fast',
      counter_search: mode === 'ultra_deep' || mode === 'ultra_exhaustive',
      claim_ledger: true,
      social_recency: xIntent || mode === 'x_search',
      code_execution_verification: /\b(code|implementation|test|runtime|구현)\b/i.test(query)
    },
    capabilities: {
      docs: context7Available ? ['context7', 'official_web'] : ['official_web'],
      web_search: !offline ? ['codex_web'] : [],
      repo_search: ['github'],
      social: xIntent || mode === 'x_search' ? ['x_public', 'authenticated_chrome_optional', 'official_x_api_optional'] : [],
      browser: ['codex_browser_optional', 'codex_chrome_optional']
    },
    selected_providers: [...selected],
    context7: {
      required: docsIntent,
      available: context7Available,
      status: docsIntent ? (context7Available ? (offline ? 'offline_only' : 'available') : 'missing') : 'not_required'
    },
    codex_web_search: {
      required: !offline,
      available: codex.available,
      status: codex.status,
      reason: codex.reason
    },
    wrongness_kinds: wrongnessKinds,
    blockers,
    warnings
  }
}

export async function writeSourceIntelligencePolicyArtifact(
  missionDir: string,
  policy: SourceIntelligencePolicy
): Promise<string> {
  const artifact = path.join(missionDir, 'source-intelligence-policy.json')
  await writeJsonAtomic(artifact, policy)
  return artifact
}

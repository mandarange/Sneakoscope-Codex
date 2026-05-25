import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import type { XaiMcpDetection } from '../mcp/xai-mcp-detector.js'
import type { CodexWebSearchCapability } from '../codex/codex-web-search-adapter.js'

export const SOURCE_INTELLIGENCE_POLICY_SCHEMA = 'sks.source-intelligence-policy.v1'

export type SourceIntelligenceMode =
  | 'context7_codex_web'
  | 'context7_codex_web_xai'
  | 'offline_context7_only'
  | 'context7_only_degraded'
  | 'blocked'

export interface SourceIntelligencePolicy {
  schema: typeof SOURCE_INTELLIGENCE_POLICY_SCHEMA
  generated_at: string
  ok: boolean
  route: string
  mode: SourceIntelligenceMode
  context7: {
    required: boolean
    available: boolean
    status: 'available' | 'missing' | 'offline_only'
  }
  codex_web_search: {
    required: boolean
    available: boolean
    status: CodexWebSearchCapability['status']
    reason: string | null
  }
  xai_mcp: {
    required: boolean
    configured: boolean
    search_capable: boolean
    configured_but_unverified: boolean
    status: string
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
  xaiDetection?: XaiMcpDetection
} = {}): SourceIntelligencePolicy {
  const route = input.route || 'unknown'
  const offline = input.offline === true
  const context7Available = input.context7Available !== false
  const codex = input.codexWebCapability || {
    schema: 'sks.codex-web-search-capability.v1',
    available: false,
    status: 'degraded_unverified' as const,
    reason: 'capability_not_checked'
  }
  const xai = input.xaiDetection
  const xaiSearchCapable = xai?.search_capable === true
  const xaiConfigured = xai?.configured === true
  const blockers: string[] = []
  const warnings: string[] = []
  const wrongnessKinds: string[] = []

  if (!context7Available) {
    blockers.push('docs_context_missing')
    wrongnessKinds.push('context7_missing')
  }
  if (!offline && codex.status === 'unavailable') {
    warnings.push('codex_web_search_unavailable_degraded_to_context7_only')
    wrongnessKinds.push('codex_web_search_missing')
  }
  if (xaiSearchCapable) warnings.push('xai_search_evidence_required_for_verified_current_claims')
  if (xaiConfigured && !xaiSearchCapable && xai?.configured_but_unverified) warnings.push('xai_mcp_configured_but_search_capability_unverified')

  const mode: SourceIntelligenceMode = !context7Available
    ? 'blocked'
    : offline
      ? 'offline_context7_only'
      : xaiSearchCapable
        ? 'context7_codex_web_xai'
        : codex.status === 'unavailable'
          ? 'context7_only_degraded'
          : 'context7_codex_web'

  return {
    schema: SOURCE_INTELLIGENCE_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    route,
    mode,
    context7: {
      required: true,
      available: context7Available,
      status: context7Available ? (offline ? 'offline_only' : 'available') : 'missing'
    },
    codex_web_search: {
      required: !offline,
      available: codex.available,
      status: codex.status,
      reason: codex.reason
    },
    xai_mcp: {
      required: xaiSearchCapable,
      configured: xaiConfigured,
      search_capable: xaiSearchCapable,
      configured_but_unverified: xai?.configured_but_unverified === true,
      status: xai?.status || 'not_checked'
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

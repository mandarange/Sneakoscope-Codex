import type { CodexWebSearchEvidence } from '../codex/codex-web-search-adapter.js'
import type { XaiSearchEvidence } from '../mcp/xai-search-adapter.js'
import type { SourceIntelligencePolicy } from './source-intelligence-policy.js'
import type { Context7Evidence } from './source-intelligence-runner.js'

export const SOURCE_INTELLIGENCE_PROOF_SCHEMA = 'sks.source-intelligence-proof.v1'

export interface SourceIntelligenceProof {
  schema: typeof SOURCE_INTELLIGENCE_PROOF_SCHEMA
  ok: boolean
  mode: SourceIntelligencePolicy['mode']
  source_intelligence: {
    context7_required: boolean
    context7_ok: boolean
    codex_web_required: boolean
    codex_web_ok: boolean
    xai_required: boolean
    xai_ok: boolean
    xai_missing_is_blocker: boolean
  }
  wrongness_kinds: string[]
  blockers: string[]
}

export function buildSourceIntelligenceProof(
  policy: SourceIntelligencePolicy,
  evidence: { context7?: Context7Evidence; codex_web_search?: CodexWebSearchEvidence | null; xai_search?: XaiSearchEvidence | null }
): SourceIntelligenceProof {
  const blockers = [...policy.blockers]
  const wrongnessKinds = [...policy.wrongness_kinds]
  const context7Ok = evidence.context7?.ok === true
  const codexWebOk = policy.codex_web_search.required ? evidence.codex_web_search?.ok === true : true
  const xaiOk = policy.xai_mcp.required ? evidence.xai_search?.ok === true : true
  const xaiMissingIsBlocker = policy.xai_mcp.required && !xaiOk
  if (policy.context7.required && !context7Ok) {
    blockers.push('context7_missing')
    wrongnessKinds.push('context7_missing')
  }
  if (policy.codex_web_search.required && !codexWebOk && policy.mode !== 'context7_only_degraded') {
    blockers.push('codex_web_search_missing')
    wrongnessKinds.push('codex_web_search_missing')
  }
  if (policy.xai_mcp.required && !xaiOk) {
    blockers.push('xai_available_not_used')
    wrongnessKinds.push('xai_available_not_used')
  }
  return {
    schema: SOURCE_INTELLIGENCE_PROOF_SCHEMA,
    ok: blockers.length === 0,
    mode: policy.mode,
    source_intelligence: {
      context7_required: policy.context7.required,
      context7_ok: context7Ok,
      codex_web_required: policy.codex_web_search.required,
      codex_web_ok: codexWebOk,
      xai_required: policy.xai_mcp.required,
      xai_ok: xaiOk,
      xai_missing_is_blocker: xaiMissingIsBlocker
    },
    wrongness_kinds: [...new Set(wrongnessKinds)],
    blockers: [...new Set(blockers)]
  }
}

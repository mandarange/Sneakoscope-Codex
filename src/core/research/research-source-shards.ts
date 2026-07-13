import { nowIso } from '../fsx.js'
import {
  RESEARCH_SOURCE_LAYERS,
  type ResearchSourceLayer
} from './research-source-layer-catalog.js'

export { RESEARCH_SOURCE_LAYERS, type ResearchSourceLayer } from './research-source-layer-catalog.js'

export interface ResearchSourceShardOutput {
  schema: 'sks.research-source-shard-output.v1'
  mission_id: string
  cycle: number
  layer_id: string
  queries: Array<{ query: string; rationale: string }>
  sources: Array<{
    id: string
    layer: string
    kind: string
    title: string
    locator: string
    publisher_or_author: string
    published_at?: string
    accessed_at: string
    reliability: string
    credibility: string
    stance: 'supports' | 'undermines' | 'mixed' | 'context'
    claim_ids: string[]
    counterevidence_target_claim_id?: string | null
    counterevidence_target_claim_ids?: string[]
    contradiction_rationale?: string | null
    notes: string
    content_artifact?: string | null
    content_sha256?: string | null
    content_length?: number | null
    acquisition_verdict?: string | null
    domain?: string | null
    authority_tier?: string | null
    primary_source?: boolean
    independence_cluster_id?: string | null
  }>
  blockers: string[]
  super_search?: {
    schema: 'sks.research-super-search-link.v1'
    result_artifact: string
    proof_artifact: string
    source_ledger_artifact: string
    claim_ledger_artifact: string
    proof_ok: boolean
    verified_sources: number
    provider_independent: boolean
    verified_provider_families: string[]
    verified_independence_clusters: string[]
    query_execution: unknown
  }
}

export function researchSourceLayerById(id: string): ResearchSourceLayer {
  return RESEARCH_SOURCE_LAYERS.find((layer) => layer.id === id) || RESEARCH_SOURCE_LAYERS[0]!
}

export function buildResearchSourceShardPrompt(plan: any, layer: ResearchSourceLayer): string {
  return [
    'You are executing one read-only SKS Research source shard.',
    `Mission: ${plan?.mission_id || 'unknown'}`,
    `Topic: ${plan?.prompt || ''}`,
    `Source layer: ${layer.id} (${layer.label})`,
    `Purpose: ${layer.purpose}`,
    '',
    'Return only JSON matching sks.research-source-shard-output.v1.',
    'Do not modify source files. If live source access is unavailable, return blockers instead of inventing sources.',
    'Every source row must include locator, publisher_or_author, accessed_at, reliability, credibility, stance, claim_ids, and notes.',
    `Suggested query templates: ${layer.query_templates.join(' | ')}`
  ].join('\n')
}

export function defaultResearchSourceShardOutput(plan: any, layer: ResearchSourceLayer, cycle = 1): ResearchSourceShardOutput {
  const missionId = String(plan?.mission_id || '')
  const topic = String(plan?.prompt || 'research mission')
  const base = RESEARCH_SOURCE_LAYERS.findIndex((candidate) => candidate.id === layer.id)
  const index = base >= 0 ? base : 0
  const firstClaim = layer.id === 'counterevidence_factcheck' ? 'stage-claim-1' : `stage-claim-${(index % 8) + 1}`
  const secondClaim = layer.id === 'counterevidence_factcheck' ? 'stage-claim-2' : `stage-claim-${((index + 1) % 8) + 1}`
  const primaryClaimIds = layer.id === 'counterevidence_factcheck' ? ['stage-claim-1', 'stage-claim-2', 'stage-claim-7'] : [firstClaim, secondClaim]
  const secondaryClaimIds = layer.id === 'counterevidence_factcheck'
    ? ['stage-claim-1', 'stage-claim-2', 'stage-claim-8']
    : layer.id === 'local_project_evidence' ? [secondClaim, 'stage-claim-7', 'stage-claim-8'] : [secondClaim]
  const stance = layer.id === 'counterevidence_factcheck' ? 'undermines' : 'supports'
  return {
    schema: 'sks.research-source-shard-output.v1',
    mission_id: missionId,
    cycle,
    layer_id: layer.id,
    queries: layer.query_templates.slice(0, 3).map((query) => ({
      query: query.replace(/<topic>/g, topic),
      rationale: `Layer-specific query for ${layer.label}.`
    })),
    sources: [
      {
        id: `shard-${layer.id}-primary`,
        layer: layer.id,
        kind: 'deterministic_fixture',
        title: `${layer.label} primary evidence for ${topic}`,
        locator: layer.id === 'local_project_evidence' ? 'git ls-files' : `deterministic://${layer.id}/primary`,
        publisher_or_author: layer.id === 'local_project_evidence' ? 'local repository' : 'SKS deterministic research shard',
        published_at: nowIso().slice(0, 10),
        accessed_at: nowIso(),
        reliability: layer.id === 'public_discourse' ? 'medium' : 'high',
        credibility: layer.id === 'public_discourse' ? 'contextual' : 'layer-appropriate',
        stance,
        claim_ids: primaryClaimIds,
        ...(layer.id === 'counterevidence_factcheck' ? {
          counterevidence_target_claim_id: primaryClaimIds[0],
          counterevidence_target_claim_ids: [primaryClaimIds[0]!, 'stage-claim-7'],
          contradiction_rationale: `Deterministic fixture challenges ${primaryClaimIds[0]} for counterevidence contract testing.`
        } : {}),
        notes: `${layer.label} shard records reproducible evidence metadata for ${topic}.`
      },
      {
        id: `shard-${layer.id}-secondary`,
        layer: layer.id,
        kind: 'deterministic_fixture',
        title: `${layer.label} secondary evidence for ${topic}`,
        locator: layer.id === 'local_project_evidence' ? 'package.json docs src schemas' : `deterministic://${layer.id}/secondary`,
        publisher_or_author: layer.id === 'local_project_evidence' ? 'local repository' : 'SKS deterministic research shard',
        published_at: nowIso().slice(0, 10),
        accessed_at: nowIso(),
        reliability: 'medium',
        credibility: 'corroborating',
        stance: layer.id === 'counterevidence_factcheck' ? 'undermines' : 'supports',
        claim_ids: secondaryClaimIds,
        ...(layer.id === 'counterevidence_factcheck' ? {
          counterevidence_target_claim_id: secondaryClaimIds[1] || secondaryClaimIds[0],
          counterevidence_target_claim_ids: [secondaryClaimIds[1] || secondaryClaimIds[0]!, 'stage-claim-8'],
          contradiction_rationale: `Deterministic fixture challenges ${secondaryClaimIds[1] || secondaryClaimIds[0]} for counterevidence contract testing.`
        } : {}),
        notes: `${layer.label} shard adds a second row so merger and triangulation are observable.`
      }
    ],
    blockers: []
  }
}

export function validateResearchSourceShardOutput(output: any): { ok: boolean; blockers: string[] } {
  const blockers: string[] = []
  if (output?.schema !== 'sks.research-source-shard-output.v1') blockers.push('source_shard_schema_invalid')
  if (!String(output?.mission_id || '').trim()) blockers.push('source_shard_mission_missing')
  if (!String(output?.layer_id || '').trim()) blockers.push('source_shard_layer_missing')
  const sources = Array.isArray(output?.sources) ? output.sources : []
  const shardBlockers = Array.isArray(output?.blockers) ? output.blockers.filter(Boolean).map(String) : []
  if (!sources.length && !shardBlockers.length) blockers.push('source_shard_empty_without_blocker')
  for (const source of sources) {
    for (const field of ['id', 'layer', 'kind', 'title', 'locator', 'publisher_or_author', 'accessed_at', 'reliability', 'credibility', 'stance', 'notes']) {
      if (!String(source?.[field] || '').trim()) blockers.push(`source_shard_source_field_missing:${field}`)
    }
    if (!Array.isArray(source?.claim_ids) || source.claim_ids.length === 0) blockers.push(`source_shard_claim_ids_missing:${source?.id || 'unknown'}`)
    if (source?.stance === 'undermines') {
      const targetClaimIds = [
        ...(Array.isArray(source?.counterevidence_target_claim_ids) ? source.counterevidence_target_claim_ids : []),
        source?.counterevidence_target_claim_id
      ].map((value) => String(value || '').trim()).filter(Boolean)
      if (!targetClaimIds.length) blockers.push(`source_shard_counterevidence_target_missing:${source?.id || 'unknown'}`)
      if (!String(source?.contradiction_rationale || '').trim()) blockers.push(`source_shard_counterevidence_rationale_missing:${source?.id || 'unknown'}`)
    }
  }
  return { ok: blockers.length === 0, blockers: [...new Set(blockers)] }
}

export const researchSourceShardOutputSchema = {
  type: 'object',
  required: ['schema', 'mission_id', 'cycle', 'layer_id', 'queries', 'sources', 'blockers'],
  properties: {
    schema: { const: 'sks.research-source-shard-output.v1' },
    mission_id: { type: 'string' },
    cycle: { type: 'number' },
    layer_id: { type: 'string' },
    queries: { type: 'array' },
    sources: { type: 'array' },
    blockers: { type: 'array' }
  }
}

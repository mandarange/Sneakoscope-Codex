import { nowIso } from '../fsx.js'

export interface ResearchSourceLayer {
  id: string
  label: string
  purpose: string
  evidence_role: string
  examples: string[]
  query_templates: string[]
}

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
    notes: string
  }>
  blockers: string[]
}

export const RESEARCH_SOURCE_LAYERS: readonly ResearchSourceLayer[] = Object.freeze([
  {
    id: 'academic_literature',
    label: 'Academic literature',
    purpose: 'Find papers, preprints, reviews, citations, and archival scholarly evidence before synthesis.',
    evidence_role: 'formal_evidence',
    examples: ['arXiv', 'Semantic Scholar', 'OpenAlex', 'Crossref', 'PubMed'],
    query_templates: ['"<topic>" arxiv', '"<topic>" Semantic Scholar', '"<topic>" OpenAlex Crossref PubMed']
  },
  {
    id: 'official_government_data',
    label: 'Official government data',
    purpose: 'Ground claims in public datasets, policy papers, national statistics, and leading-institution sources.',
    evidence_role: 'authoritative_baseline',
    examples: ['World Bank', 'OECD', 'Eurostat', 'data.gov', 'NIST'],
    query_templates: ['"<topic>" site:worldbank.org OR site:oecd.org', '"<topic>" site:data.gov', '"<topic>" site:nist.gov']
  },
  {
    id: 'standards_primary_docs',
    label: 'Standards and primary documents',
    purpose: 'Check specifications, standards, RFCs, policy originals, and official project documents before relying on summaries.',
    evidence_role: 'primary_source',
    examples: ['IETF RFCs', 'W3C', 'ISO abstracts', 'official standards bodies'],
    query_templates: ['"<topic>" RFC standard specification', '"<topic>" W3C IETF NIST standard', '"<topic>" official specification']
  },
  {
    id: 'news_current_events',
    label: 'News and current events',
    purpose: 'Capture recent events, public impact, and regional framing from reputable news and current-event indices.',
    evidence_role: 'recency_signal',
    examples: ['GDELT', 'BBC', 'Reuters', 'AP', 'regional reputable outlets'],
    query_templates: ['"<topic>" latest Reuters AP', '"<topic>" GDELT news', '"<topic>" BBC analysis']
  },
  {
    id: 'public_discourse',
    label: 'Public discourse',
    purpose: 'Sample public practitioner and community discourse without treating popularity as truth.',
    evidence_role: 'sentiment_and_edge_cases',
    examples: ['X/Twitter', 'Reddit', 'Hacker News', 'public forums'],
    query_templates: ['"<topic>" site:x.com OR site:twitter.com', '"<topic>" site:reddit.com', '"<topic>" "Hacker News"']
  },
  {
    id: 'developer_practitioner',
    label: 'Developer and practitioner knowledge',
    purpose: 'Find implementation pitfalls, developer questions, bug reports, and operational lessons.',
    evidence_role: 'practice_feedback',
    examples: ['Stack Overflow', 'Stack Exchange', 'GitHub issues', 'release notes', 'engineering blogs'],
    query_templates: ['"<topic>" site:stackoverflow.com', '"<topic>" site:stackexchange.com', '"<topic>" site:github.com issues']
  },
  {
    id: 'counterevidence_factcheck',
    label: 'Counterevidence and fact checking',
    purpose: 'Actively search for failures, critiques, null results, retractions, fact checks, and source conflicts.',
    evidence_role: 'falsification',
    examples: ['Fact checks', 'Retraction Watch', 'critical reviews', 'benchmark failures', 'negative results'],
    query_templates: ['"<topic>" critique failure limitation', '"<topic>" fact check retraction', '"<topic>" counterevidence null result']
  },
  {
    id: 'local_project_evidence',
    label: 'Local project evidence',
    purpose: 'Inspect repository-local files, scripts, docs, schemas, and tests as implementation evidence for handoff.',
    evidence_role: 'local_evidence',
    examples: ['git ls-files', 'package scripts', 'source modules', 'docs', 'schemas'],
    query_templates: ['git ls-files', 'rg "<topic>" src docs schemas package.json']
  }
])

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
  const stance = layer.id === 'counterevidence_factcheck' ? 'undermines' : layer.id === 'local_project_evidence' ? 'context' : 'supports'
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
        kind: layer.id === 'local_project_evidence' ? 'local_project' : 'deterministic_fixture',
        title: `${layer.label} primary evidence for ${topic}`,
        locator: layer.id === 'local_project_evidence' ? 'git ls-files' : `deterministic://${layer.id}/primary`,
        publisher_or_author: layer.id === 'local_project_evidence' ? 'local repository' : 'SKS deterministic research shard',
        published_at: nowIso().slice(0, 10),
        accessed_at: nowIso(),
        reliability: layer.id === 'public_discourse' ? 'medium' : 'high',
        credibility: layer.id === 'public_discourse' ? 'contextual' : 'layer-appropriate',
        stance,
        claim_ids: primaryClaimIds,
        notes: `${layer.label} shard records reproducible evidence metadata for ${topic}.`
      },
      {
        id: `shard-${layer.id}-secondary`,
        layer: layer.id,
        kind: layer.id === 'local_project_evidence' ? 'local_project' : 'deterministic_fixture',
        title: `${layer.label} secondary evidence for ${topic}`,
        locator: layer.id === 'local_project_evidence' ? 'package.json docs src schemas' : `deterministic://${layer.id}/secondary`,
        publisher_or_author: layer.id === 'local_project_evidence' ? 'local repository' : 'SKS deterministic research shard',
        published_at: nowIso().slice(0, 10),
        accessed_at: nowIso(),
        reliability: 'medium',
        credibility: 'corroborating',
        stance: layer.id === 'counterevidence_factcheck' ? 'undermines' : 'mixed',
        claim_ids: secondaryClaimIds,
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

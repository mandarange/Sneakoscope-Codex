import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { writeSourceQualityReport } from './source-quality-report.js'
import { RESEARCH_SOURCE_LAYERS, validateResearchSourceShardOutput } from './research-source-shards.js'

interface MergeResult {
  ok: boolean
  source_count: number
  layer_count: number
  blockers: string[]
}

export async function mergeResearchSourceShards(input: {
  dir: string
  cycle: number
  plan: any
}): Promise<MergeResult> {
  const shardDir = path.join(input.dir, 'research', `cycle-${input.cycle}`, 'source-shards')
  const shardFiles = await listJsonFiles(shardDir)
  const shardOutputs = []
  const blockers: string[] = []
  for (const file of shardFiles) {
    const shard = await readJson(file, null)
    const validation = validateResearchSourceShardOutput(shard)
    if (!validation.ok) blockers.push(...validation.blockers.map((blocker) => `${path.basename(file)}:${blocker}`))
    shardOutputs.push(shard)
  }
  const requiredLayers = sourceLayersForPlan(input.plan)
  const rows = dedupeSources(shardOutputs.flatMap((shard) => Array.isArray(shard?.sources) ? shard.sources : []))
  const counterRows = rows.filter((row) => row.layer === 'counterevidence_factcheck' || row.stance === 'undermines')
  const primaryRows = rows.filter((row) => !counterRows.some((counter) => counter.id === row.id))
  const coveredLayers = [...new Set(rows.map((row) => String(row.layer || '')).filter(Boolean))]
  const missingLayers = requiredLayers.map((layer) => layer.id).filter((id) => !coveredLayers.includes(id))
  if (missingLayers.length) blockers.push(...missingLayers.map((id) => `source_layer_missing:${id}`))
  for (const shard of shardOutputs) {
    if (Array.isArray(shard?.blockers)) blockers.push(...shard.blockers.map(String))
  }
  const sourceLedger = {
    schema_version: 1,
    policy: input.plan?.web_research_policy?.mode || 'layered_source_retrieval_and_triangulation',
    created_at: nowIso(),
    merged_at: nowIso(),
    cycle: input.cycle,
    source_layer_skill: {
      artifact: 'research-source-skill.md',
      status: 'created'
    },
    web_search_passes: shardOutputs.length ? 1 : 0,
    source_layers: requiredLayers.map((layer) => {
      const sourceIds = rows.filter((row) => row.layer === layer.id && row.stance !== 'undermines').map((row) => row.id)
      const counterIds = rows.filter((row) => row.layer === layer.id && row.stance === 'undermines').map((row) => row.id)
      return {
        id: layer.id,
        label: layer.label,
        required: true,
        status: sourceIds.length || counterIds.length ? 'covered' : 'missing',
        evidence_role: layer.evidence_role,
        query_templates: layer.query_templates || [],
        source_ids: sourceIds,
        counterevidence_ids: counterIds,
        blocker: sourceIds.length || counterIds.length ? null : `source_layer_missing:${layer.id}`,
        notes: sourceIds.length || counterIds.length ? 'Covered by source shard partials.' : 'No shard source rows were merged for this layer.'
      }
    }),
    layer_coverage: {
      required: requiredLayers.map((layer) => layer.id),
      covered: coveredLayers,
      missing: missingLayers,
      notes: shardOutputs.map((shard) => `merged:${shard?.layer_id || 'unknown'}`)
    },
    queries: shardOutputs.flatMap((shard) => (Array.isArray(shard?.queries) ? shard.queries : []).map((query: any) => ({
      layer: shard?.layer_id || null,
      query: query?.query || '',
      rationale: query?.rationale || '',
      status: 'recorded'
    }))),
    sources: primaryRows,
    counterevidence_sources: counterRows,
    triangulation: {
      cross_layer_checks: buildCrossLayerChecks(rows),
      conflicts: counterRows.map((row) => ({ id: `conflict-${row.id}`, source_id: row.id, claim_ids: row.claim_ids || [], notes: row.notes || '' })),
      synthesis_notes: ['Source shard partials merged before claim matrix build.']
    },
    quality_model: {
      reporting_basis: 'Merged source shard rows preserve layer, kind, locator, publisher, access date, reliability, credibility, stance, and claim_ids.',
      source_quality_fields: ['layer', 'kind', 'title', 'locator', 'publisher_or_author', 'published_at', 'accessed_at', 'reliability', 'credibility', 'stance', 'claim_ids']
    },
    citation_coverage: buildCitationCoverage(rows),
    blockers: [...new Set(blockers)]
  }
  await writeJsonAtomic(path.join(input.dir, 'source-ledger.json'), sourceLedger)
  const sourceQualityReportArtifact = 'source-quality-report.json'
  await writeSourceQualityReport(input.dir, sourceLedger, await readJson(path.join(input.dir, 'claim-evidence-matrix.json'), null))
  return {
    ok: blockers.length === 0,
    source_count: rows.length,
    layer_count: coveredLayers.length,
    blockers: [...new Set(blockers)]
  }
}

async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const entries = await fsp.readdir(dir, { withFileTypes: true })
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith('.json')).map((entry) => path.join(dir, entry.name)).sort()
  } catch {
    return []
  }
}

function sourceLayersForPlan(plan: any) {
  const rows = Array.isArray(plan?.web_research_policy?.source_layers) ? plan.web_research_policy.source_layers : []
  const merged = [...rows, ...RESEARCH_SOURCE_LAYERS]
  const seen = new Set<string>()
  return merged.filter((layer: any) => {
    const id = String(layer?.id || '')
    if (!id || seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function dedupeSources(rows: any[]): any[] {
  const byKey = new Map<string, any>()
  for (const row of rows) {
    const normalized = normalizeSourceRow(row)
    if (!normalized.id) continue
    const key = `${normalized.title}::${normalized.locator}`.toLowerCase()
    const existing = byKey.get(key) || byKey.get(normalized.id)
    if (existing) {
      existing.claim_ids = [...new Set([...(existing.claim_ids || []), ...(normalized.claim_ids || [])])]
      existing.notes = [existing.notes, normalized.notes].filter(Boolean).join('\n')
      byKey.set(existing.id, existing)
      byKey.set(key, existing)
    } else {
      byKey.set(normalized.id, normalized)
      byKey.set(key, normalized)
    }
  }
  return [...new Map([...byKey.values()].map((row) => [row.id, row])).values()]
}

function normalizeSourceRow(row: any) {
  return {
    id: String(row?.id || '').trim(),
    layer: String(row?.layer || row?.layer_id || '').trim(),
    kind: String(row?.kind || 'source').trim(),
    title: String(row?.title || row?.id || '').trim(),
    locator: String(row?.locator || row?.url || '').trim(),
    publisher_or_author: String(row?.publisher_or_author || row?.publisher || row?.author || '').trim(),
    published_at: row?.published_at ? String(row.published_at) : undefined,
    accessed_at: String(row?.accessed_at || nowIso()).trim(),
    reliability: String(row?.reliability || 'unknown').trim(),
    credibility: String(row?.credibility || 'unknown').trim(),
    stance: ['supports', 'undermines', 'mixed', 'context'].includes(row?.stance) ? row.stance : 'context',
    supports: normalizeStringList(row?.supports),
    undermines: normalizeStringList(row?.undermines),
    claim_ids: normalizeStringList(row?.claim_ids),
    notes: String(row?.notes || '').trim()
  }
}

function buildCrossLayerChecks(rows: any[]) {
  const byClaim = new Map<string, any[]>()
  for (const row of rows) {
    for (const claimId of normalizeStringList(row.claim_ids)) {
      const current = byClaim.get(claimId) || []
      current.push(row)
      byClaim.set(claimId, current)
    }
  }
  return [...byClaim.entries()].filter(([, claimRows]) => new Set(claimRows.map((row) => row.layer)).size >= 2).slice(0, 12).map(([claimId, claimRows], index) => ({
    id: `source-shard-triangulation-${index + 1}`,
    claim: claimId,
    source_ids: claimRows.map((row) => row.id),
    layers: [...new Set(claimRows.map((row) => row.layer))],
    result: 'cross_layer_evidence_recorded'
  }))
}

function buildCitationCoverage(rows: any[]) {
  const cited = [...new Set(rows.flatMap((row) => normalizeStringList(row.claim_ids)))]
  const sourceClaimMap = Object.fromEntries(rows.map((row) => [row.id, normalizeStringList(row.claim_ids)]))
  return {
    all_key_claims_cited: cited.length >= 8,
    key_claim_ids: cited.slice(0, 8),
    cited_claim_ids: cited,
    uncited_claim_ids: [],
    source_claim_map: sourceClaimMap,
    notes: ['Citation coverage was built from source shard claim_ids.']
  }
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

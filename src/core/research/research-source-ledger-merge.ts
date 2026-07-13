import fsp from 'node:fs/promises'
import path from 'node:path'
import { nowIso, readJson, sha256, writeJsonAtomic } from '../fsx.js'
import { writeSourceQualityReport } from './source-quality-report.js'
import { validateResearchSourceProvenance } from './research-source-evidence.js'
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
  const shardOutputs: any[] = []
  const superSearchRuns: any[] = []
  const blockers: string[] = []
  for (const file of shardFiles) {
    const shard = await readJson(file, null)
    const validation = validateResearchSourceShardOutput(shard)
    if (!validation.ok) blockers.push(...validation.blockers.map((blocker) => `${path.basename(file)}:${blocker}`))
    const materialized = await materializeShardSuperSearchProvenance(input.dir, shard)
    blockers.push(...materialized.blockers.map((blocker) => `${path.basename(file)}:${blocker}`))
    shardOutputs.push(materialized.shard)
    if (materialized.run) superSearchRuns.push(materialized.run)
  }
  const requiredLayers = sourceLayersForPlan(input.plan)
  const rows = dedupeSources(shardOutputs.flatMap((shard) => Array.isArray(shard?.sources) ? shard.sources : []))
  const counterCandidates = rows.filter((row) => row.stance === 'undermines')
  const unstructuredCounterRows = counterCandidates.filter((row) => !structuredCounterevidence(row))
  blockers.push(...unstructuredCounterRows.map((row) => `counterevidence_link_unstructured:${row.id || 'unknown'}`))
  const counterRows = counterCandidates.filter((row) => structuredCounterevidence(row))
  const counterRowIds = new Set(counterRows.map((row) => String(row.id || '')))
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
    super_search_runs: superSearchRuns,
    source_layers: requiredLayers.map((layer) => {
      const sourceIds = rows.filter((row) => row.layer === layer.id && !counterRowIds.has(String(row.id || ''))).map((row) => row.id)
      const counterIds = rows.filter((row) => row.layer === layer.id && counterRowIds.has(String(row.id || ''))).map((row) => row.id)
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

export function linkSourceLedgerToClaimMatrix(sourceLedger: any, claimMatrix: any) {
  const claims = Array.isArray(claimMatrix?.claims) ? claimMatrix.claims : []
  const keyClaimIds = Array.isArray(claimMatrix?.key_claim_ids) ? claimMatrix.key_claim_ids.map(String) : []
  const originalSources = Array.isArray(sourceLedger?.sources) ? sourceLedger.sources : []
  const originalCounterSources = Array.isArray(sourceLedger?.counterevidence_sources) ? sourceLedger.counterevidence_sources : []
  const originalCounterIds = new Set(originalCounterSources.map((source: any) => String(source?.id || '')).filter(Boolean))
  const sourceRowsById = new Map([...originalSources, ...originalCounterSources]
    .map((source: any) => [String(source?.id || ''), source]))
  const sourceToClaims = new Map<string, { supports: string[]; undermines: string[]; contradiction_rationales: string[] }>()
  const linkBlockers: string[] = []
  for (const claim of claims) {
    const claimId = String(claim?.id || '').trim()
    if (!claimId) continue
    for (const sourceId of normalizeStringList(claim?.source_ids)) {
      const source = sourceRowsById.get(sourceId)
      if (!source || !supportLinkAllowed(source, originalCounterIds.has(sourceId))) {
        linkBlockers.push(`claim_support_source_untrusted:${claimId}:${sourceId}`)
        continue
      }
      const row = sourceToClaims.get(sourceId) || { supports: [], undermines: [], contradiction_rationales: [] }
      row.supports.push(claimId)
      sourceToClaims.set(sourceId, row)
    }
   for (const sourceId of normalizeStringList(claim?.counterevidence_ids)) {
     const source = sourceRowsById.get(sourceId)
      const structuredLink = (Array.isArray(claim?.counterevidence_links) ? claim.counterevidence_links : [])
        .find((link: any) => String(link?.source_id || '') === sourceId && String(link?.target_claim_id || '') === claimId && String(link?.contradiction_rationale || '').trim())
      if (!source || !structuredLink || !counterevidenceLinkAllowed(source)) {
       linkBlockers.push(`claim_counterevidence_source_untrusted:${claimId}:${sourceId}`)
       continue
     }
      const row = sourceToClaims.get(sourceId) || { supports: [], undermines: [], contradiction_rationales: [] }
     row.undermines.push(claimId)
      row.contradiction_rationales.push(String(structuredLink.contradiction_rationale).trim())
     sourceToClaims.set(sourceId, row)
   }
 }
 const link = (source: any) => {
    const mapped = sourceToClaims.get(String(source?.id || '')) || { supports: [], undermines: [], contradiction_rationales: [] }
   const semanticCounterTargets = [...new Set(mapped.undermines)]
   return {
     ...source,
      stance: semanticCounterTargets.length ? 'undermines' : source?.stance || 'context',
      discovery_claim_ids: normalizeStringList(source?.discovery_claim_ids || source?.claim_ids),
      supports: [...new Set(mapped.supports)],
      undermines: semanticCounterTargets,
      claim_ids: [...new Set([...mapped.supports, ...mapped.undermines])],
      ...(semanticCounterTargets.length ? {
        counterevidence_target_claim_id: semanticCounterTargets[0],
       counterevidence_target_claim_ids: semanticCounterTargets,
       contradiction_rationale: [
          ...mapped.contradiction_rationales,
          `Validated semantic claim synthesis links this source against ${semanticCounterTargets.join(', ')}.`
       ].filter(Boolean).join(' ')
      } : {}),
      semantic_claim_linked: mapped.supports.length > 0 || mapped.undermines.length > 0
    }
  }
 const rows = [
   ...originalSources,
   ...originalCounterSources
 ].map(link)
  const semanticCounterIds = new Set(rows.filter((row) => normalizeStringList(row?.undermines).length > 0).map((row) => String(row?.id || '')))
  const counterevidenceSources = rows.filter((row) => semanticCounterIds.has(String(row?.id || '')))
  const sources = rows.filter((row) => !semanticCounterIds.has(String(row?.id || '')))
  const sourceLayers = (Array.isArray(sourceLedger?.source_layers) ? sourceLedger.source_layers : []).map((layer: any) => {
    const layerRows = rows.filter((row) => row.layer === layer.id)
    return {
      ...layer,
      source_ids: layerRows.filter((row) => !semanticCounterIds.has(String(row?.id || ''))).map((row) => row.id),
      counterevidence_ids: layerRows.filter((row) => semanticCounterIds.has(String(row?.id || ''))).map((row) => row.id)
    }
  })
  return {
    ...sourceLedger,
    sources,
    counterevidence_sources: counterevidenceSources,
    source_layers: sourceLayers,
    claim_link_blockers: [...new Set(linkBlockers)],
    triangulation: {
      ...(sourceLedger?.triangulation || {}),
      cross_layer_checks: buildCrossLayerChecks(rows),
      conflicts: counterevidenceSources.flatMap((row) => normalizeStringList(row.claim_ids).map((claimId) => ({
        id: `conflict-${row.id}-${claimId}`,
        source_id: row.id,
        claim_ids: [claimId],
        notes: row.notes || ''
      }))),
      synthesis_notes: ['Semantic claim links were rebuilt from the validated claim-evidence matrix.']
    },
    citation_coverage: buildCitationCoverage(rows, keyClaimIds)
  }
}

async function materializeShardSuperSearchProvenance(dir: string, shard: any): Promise<{
  shard: any
  run: any | null
  blockers: string[]
}> {
  const sources = Array.isArray(shard?.sources) ? shard.sources : []
  const verifiedSources = sources.filter((source: any) => String(source?.acquisition_verdict || '') === 'verified_content')
  const link = shard?.super_search
  if (link?.schema !== 'sks.research-super-search-link.v1') {
    return {
      shard,
      run: null,
      blockers: verifiedSources.map((source: any) => `super_search_provenance_missing:${String(source?.id || 'unknown')}`)
    }
  }

  const [proofArtifact, sourceLedgerArtifact] = await Promise.all([
    readMissionArtifact(dir, link.proof_artifact),
    readMissionArtifact(dir, link.source_ledger_artifact)
  ])
  const shared = {
    schema: 'sks.research-super-search-source-provenance.v1',
    layer_id: String(shard?.layer_id || ''),
    proof_artifact: String(link?.proof_artifact || ''),
    proof_sha256: proofArtifact?.sha256 || null,
    source_ledger_artifact: String(link?.source_ledger_artifact || ''),
    source_ledger_sha256: sourceLedgerArtifact?.sha256 || null
  }
  const validationBlockers: string[] = []
  const enrichedSources = await Promise.all(sources.map(async (source: any) => {
    const provenance: any = {
      ...shared,
      source_id: String(source?.id || source?.source_id || ''),
      validated: false,
      blockers: []
    }
    const enriched = { ...source, super_search_provenance: provenance }
    const validation = await validateResearchSourceProvenance(dir, enriched)
    provenance.validated = validation.ok
    provenance.blockers = validation.blockers
    if (String(source?.acquisition_verdict || '') === 'verified_content' && !validation.ok) validationBlockers.push(...validation.blockers)
    return enriched
  }))
  const verifiedSourceIds = enrichedSources
    .filter((source: any) => source?.super_search_provenance?.validated === true)
    .map((source: any) => String(source?.id || source?.source_id || ''))
    .filter(Boolean)
  const run = {
    schema: 'sks.research-super-search-run-provenance.v1',
    layer_id: shared.layer_id,
    proof_artifact: shared.proof_artifact,
    proof_sha256: shared.proof_sha256,
    source_ledger_artifact: shared.source_ledger_artifact,
    source_ledger_sha256: shared.source_ledger_sha256,
    proof_ok: proofArtifact?.json?.schema === 'sks.super-search-proof.v1'
      && proofArtifact.json.ok === true
      && normalizeStringList(proofArtifact.json.blockers).length === 0,
    verified_source_ids: verifiedSourceIds,
    validated: verifiedSources.length > 0 && verifiedSourceIds.length === verifiedSources.length && validationBlockers.length === 0,
    blockers: [...new Set(validationBlockers)]
  }
  return {
    shard: { ...shard, sources: enrichedSources },
    run,
    blockers: run.blockers
  }
}

async function readMissionArtifact(dir: string, artifact: unknown): Promise<{ sha256: string; json: any | null } | null> {
  const raw = String(artifact || '').trim()
  if (!raw || path.isAbsolute(raw)) return null
  const root = path.resolve(dir)
  const resolved = path.resolve(root, raw)
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null
  const bytes = await fsp.readFile(resolved).catch(() => null)
  if (!bytes) return null
  let json: any | null = null
  try {
    json = JSON.parse(bytes.toString('utf8'))
  } catch {
    json = null
  }
  return { sha256: sha256(bytes), json }
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
      existing.counterevidence_target_claim_id ||= normalized.counterevidence_target_claim_id
      existing.counterevidence_target_claim_ids = [...new Set([...(existing.counterevidence_target_claim_ids || []), ...(normalized.counterevidence_target_claim_ids || [])])]
      existing.contradiction_rationale ||= normalized.contradiction_rationale
      if (normalized.super_search_provenance?.validated === true && existing.super_search_provenance?.validated !== true) {
        existing.super_search_provenance = normalized.super_search_provenance
      }
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
    counterevidence_target_claim_id: row?.counterevidence_target_claim_id ? String(row.counterevidence_target_claim_id).trim() : null,
    counterevidence_target_claim_ids: normalizeStringList(row?.counterevidence_target_claim_ids),
    contradiction_rationale: row?.contradiction_rationale ? String(row.contradiction_rationale).trim() : null,
    notes: String(row?.notes || '').trim(),
    semantic_claim_linked: row?.semantic_claim_linked === true,
    content_artifact: row?.content_artifact ? String(row.content_artifact) : null,
    content_sha256: row?.content_sha256 ? String(row.content_sha256) : null,
    content_length: Number.isFinite(Number(row?.content_length)) ? Number(row.content_length) : null,
    acquisition_verdict: row?.acquisition_verdict ? String(row.acquisition_verdict) : null,
    domain: row?.domain ? String(row.domain) : null,
    authority_tier: row?.authority_tier ? String(row.authority_tier) : null,
    primary_source: row?.primary_source === true,
    independence_cluster_id: row?.independence_cluster_id ? String(row.independence_cluster_id) : null,
    super_search_provenance: row?.super_search_provenance && typeof row.super_search_provenance === 'object'
      ? { ...row.super_search_provenance }
      : null
  }
}

function fixtureEvidence(source: any): boolean {
  return /^(?:deterministic_fixture|mock|selftest(?:-|$))/i.test(String(source?.kind || ''))
}

function verifiedEvidence(source: any): boolean {
  return String(source?.acquisition_verdict || '') === 'verified_content'
    && /^verified_content:/i.test(String(source?.credibility || ''))
    && Boolean(String(source?.content_artifact || '').trim())
    && /^[a-f0-9]{64}$/i.test(String(source?.content_sha256 || '').trim())
    && Number(source?.content_length || 0) > 0
    && source?.super_search_provenance?.validated === true
}

function supportLinkAllowed(source: any, isCounterSource: boolean): boolean {
  return !isCounterSource && source?.stance !== 'undermines' && (verifiedEvidence(source) || fixtureEvidence(source))
}

function counterevidenceLinkAllowed(source: any): boolean {
  return verifiedEvidence(source) || fixtureEvidence(source)
}

function structuredCounterevidence(source: any): boolean {
  const targetClaimIds = normalizeStringList([
    ...normalizeStringList(source?.counterevidence_target_claim_ids),
    source?.counterevidence_target_claim_id
  ])
  return targetClaimIds.length > 0 && String(source?.contradiction_rationale || '').trim().length >= 16
}

function buildCrossLayerChecks(rows: any[]) {
  const byClaim = new Map<string, any[]>()
  for (const row of rows) {
    if (row.semantic_claim_linked !== true && !/^(?:deterministic_fixture|selftest|mock)$/i.test(String(row.kind || ''))) continue
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
    result: 'semantic_cross_layer_evidence_recorded'
  }))
}

function buildCitationCoverage(rows: any[], keyClaimIds: string[] = []) {
  const cited = [...new Set(rows.flatMap((row) => normalizeStringList(row.claim_ids)))]
  const sourceClaimMap = Object.fromEntries(rows.map((row) => [row.id, normalizeStringList(row.claim_ids)]))
  const keys = [...new Set(keyClaimIds.filter(Boolean))]
  return {
    all_key_claims_cited: keys.length > 0 && keys.every((claimId) => cited.includes(claimId)),
    key_claim_ids: keys,
    cited_claim_ids: cited,
    uncited_claim_ids: keys.filter((claimId) => !cited.includes(claimId)),
    source_claim_map: sourceClaimMap,
    notes: keys.length
      ? ['Citation coverage was rebuilt from the validated claim-evidence matrix.']
      : ['Source discovery rows are not treated as cited key claims until semantic claim synthesis completes.']
  }
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

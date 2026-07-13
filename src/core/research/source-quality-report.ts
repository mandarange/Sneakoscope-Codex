import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const SOURCE_QUALITY_REPORT_ARTIFACT = 'source-quality-report.json'

const REQUIRED_SOURCE_FIELDS = Object.freeze([
  'id',
  'layer',
  'kind',
  'title',
  'locator',
  'publisher_or_author',
  'accessed_at',
  'reliability',
  'credibility',
  'stance',
  'claim_ids'
])

function asArray(value: any): any[] {
  return Array.isArray(value) ? value : []
}

function sourceRows(sourceLedger: any = null): any[] {
  return [
    ...asArray(sourceLedger?.sources),
    ...asArray(sourceLedger?.counterevidence_sources)
  ]
}

function missingFields(row: any): string[] {
  return REQUIRED_SOURCE_FIELDS.filter((field) => {
    const value = row?.[field]
    if (field === 'claim_ids') {
      if (!Array.isArray(value)) return true
      return ['supports', 'undermines'].includes(String(row?.stance || '')) && value.length === 0
    }
    if (Array.isArray(value)) return value.length === 0
    return value === undefined || value === null || String(value).trim() === ''
  })
}

export function buildSourceQualityReport(sourceLedger: any = null, claimMatrix: any = null) {
  const rows = sourceRows(sourceLedger)
  const rowReports = rows.map((row) => {
    const missing = missingFields(row)
    return {
      id: String(row?.id || ''),
      layer: row?.layer || row?.layer_id || row?.source_layer || null,
      stance: row?.stance || null,
      claim_ids: asArray(row?.claim_ids).map(String),
      reliability: row?.reliability || null,
      credibility: row?.credibility || null,
      missing_fields: missing,
      ok: missing.length === 0
    }
  })
  const sourceLayerRows = asArray(sourceLedger?.source_layers)
  const coveredLayerIds = sourceLayerRows
    .filter((layer) => layer?.status === 'covered')
    .map((layer) => String(layer.id || layer.layer || ''))
    .filter(Boolean)
  const keyClaimIds = asArray(claimMatrix?.key_claim_ids).map(String)
  const citedClaimIds = new Set(rows.flatMap((row) => asArray(row?.claim_ids).map(String)))
  const uncitedKeyClaimIds = keyClaimIds.filter((id) => !citedClaimIds.has(id))
  const untrustedClaimLinks = rows.flatMap((row) => {
    const linked = asArray(row?.supports).length > 0 || asArray(row?.undermines).length > 0
    return linked && !trustedLinkedEvidence(row) ? [`source_claim_link_untrusted:${String(row?.id || 'unknown')}`] : []
  })
  const blockers = [
    ...rowReports.flatMap((row) => row.ok ? [] : [`source_metadata_incomplete:${row.id || 'unknown'}`]),
    ...asArray(sourceLedger?.claim_link_blockers).map(String),
    ...untrustedClaimLinks,
    ...(keyClaimIds.length && uncitedKeyClaimIds.length ? ['key_claim_citation_coverage_incomplete'] : []),
    ...(sourceLedger?.citation_coverage?.all_key_claims_cited === false ? ['source_ledger_reports_uncited_key_claims'] : [])
  ]
  return {
    schema: 'sks.research-source-quality-report.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    blockers,
    required_source_fields: [...REQUIRED_SOURCE_FIELDS],
    summary: {
      source_entries: asArray(sourceLedger?.sources).length,
      counterevidence_entries: asArray(sourceLedger?.counterevidence_sources).length,
      total_entries: rows.length,
      rows_with_complete_metadata: rowReports.filter((row) => row.ok).length,
      source_layers_covered: coveredLayerIds.length,
      key_claims: keyClaimIds.length,
      cited_key_claims: keyClaimIds.length - uncitedKeyClaimIds.length,
      uncited_key_claims: uncitedKeyClaimIds.length
    },
    citation_coverage: {
      all_key_claims_cited: uncitedKeyClaimIds.length === 0 && sourceLedger?.citation_coverage?.all_key_claims_cited === true,
      cited_claim_ids: [...citedClaimIds].sort(),
      uncited_key_claim_ids: uncitedKeyClaimIds
    },
    sources: rowReports
  }
}

function trustedLinkedEvidence(row: any): boolean {
  if (/^(?:deterministic_fixture|mock|selftest(?:-|$))/i.test(String(row?.kind || ''))) return true
  return String(row?.acquisition_verdict || '') === 'verified_content'
    && /^verified_content:/i.test(String(row?.credibility || ''))
    && Boolean(String(row?.content_artifact || '').trim())
    && /^[a-f0-9]{64}$/i.test(String(row?.content_sha256 || '').trim())
    && Number(row?.content_length || 0) > 0
    && row?.super_search_provenance?.validated === true
}

export async function readSourceQualityReport(dir: string) {
  return readJson(path.join(dir, SOURCE_QUALITY_REPORT_ARTIFACT), null)
}

export async function writeSourceQualityReport(dir: string, sourceLedger: any = null, claimMatrix: any = null) {
  const report = buildSourceQualityReport(sourceLedger, claimMatrix)
  await writeJsonAtomic(path.join(dir, SOURCE_QUALITY_REPORT_ARTIFACT), report)
  return report
}

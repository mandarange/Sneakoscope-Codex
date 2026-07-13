import { type ClaimEvidenceMatrix, normalizeClaimEvidenceMatrix } from './claim-evidence-matrix.js'
import { sha256 } from '../fsx.js'

export async function buildClaimEvidenceMatrixFromSourceShards(input: {
  dir: string
  cycle: number
  plan: any
  sourceLedger: any
  noveltyLedger: any
  falsificationLedger: any
}): Promise<ClaimEvidenceMatrix> {
  const sources = [
    ...(Array.isArray(input.sourceLedger?.sources) ? input.sourceLedger.sources : []),
    ...(Array.isArray(input.sourceLedger?.counterevidence_sources) ? input.sourceLedger.counterevidence_sources : [])
  ]
  const noveltyEntries = Array.isArray(input.noveltyLedger?.entries) ? input.noveltyLedger.entries : []
  const candidates = new Map<string, any>()
  for (const entry of noveltyEntries) {
    const id = String(entry?.id || '').trim()
    if (!id) continue
    candidates.set(id, {
      id,
      claim: String(entry?.claim || entry?.title || id),
      claim_type: entry?.type === 'implementation_guidance' ? 'implementation_guidance' : 'hypothesis',
      importance: candidates.size < 2 ? 'critical' : 'high',
     source_ids: normalizeStringList(entry?.source_ids || entry?.evidence),
     counterevidence_ids: normalizeStringList(entry?.counterevidence_ids || entry?.falsifiers),
      counterevidence_links: normalizeCounterevidenceLinks(entry?.counterevidence_links),
      test_or_probe: String(entry?.next_experiment || entry?.test_or_probe || '').trim(),
      trusted_grouping: true
    })
  }
  for (const source of sources) {
    const claimIds = normalizeStringList(source?.claim_ids)
    const usable = usableEvidenceSource(source)
    if (claimIds.length && usable) {
      for (const claimId of claimIds) {
        const sourceSpecific = claimId.startsWith('source-claim-')
        const existing = candidates.get(claimId) || {
          id: claimId,
          claim: claimTextFromSource(source, claimId),
          claim_type: 'inference',
          importance: sourceSpecific ? 'medium' : candidates.size < 2 ? 'critical' : candidates.size < 8 ? 'high' : 'medium',
         source_ids: [],
         counterevidence_ids: [],
          counterevidence_links: [],
          test_or_probe: '',
          trusted_grouping: sourceSpecific ? false : deterministicFixtureSource(source)
        }
       if (source?.stance === 'undermines') {
         existing.counterevidence_ids = [...new Set([...(existing.counterevidence_ids || []), source.id])]
          const targetClaimIds = normalizeStringList([
            ...normalizeStringList(source?.counterevidence_target_claim_ids),
            source?.counterevidence_target_claim_id
          ])
          if (targetClaimIds.includes(claimId) && String(source?.contradiction_rationale || '').trim()) {
            existing.counterevidence_links = normalizeCounterevidenceLinks([
              ...(existing.counterevidence_links || []),
              { source_id: source.id, target_claim_id: claimId, contradiction_rationale: source.contradiction_rationale }
            ])
          }
        } else if (source?.stance === 'supports') {
          existing.source_ids = [...new Set([...(existing.source_ids || []), source.id])]
        }
        if (!existing.test_or_probe) existing.test_or_probe = `Probe ${claimId} against supporting and undermining source layers.`
        candidates.set(claimId, existing)
      }
    } else if (String(source?.notes || '').trim()) {
      const id = `unlinked-source-${sha256(`${String(source?.id || '')}\0${String(source?.notes || '')}`).slice(0, 12)}`
      candidates.set(id, {
        id,
        claim: String(source.notes).slice(0, 240),
        claim_type: 'hypothesis',
        importance: 'medium',
       source_ids: [],
       counterevidence_ids: [],
        counterevidence_links: [],
        test_or_probe: `Establish a semantic claim and direct evidence link for ${source.id || id} before using it.`,
        trusted_grouping: false
      })
    }
  }
  const claims = [...candidates.values()].slice(0, Math.max(8, candidates.size)).map((candidate, index) => {
    const sourceIds = normalizeStringList(candidate.source_ids).filter((id) => sourceById(sources, id))
    const counterevidenceLinks = normalizeCounterevidenceLinks(candidate.counterevidence_links)
      .filter((link: any) => link.target_claim_id === candidate.id && sourceById(sources, link.source_id))
    const linkedCounterIds = new Set(counterevidenceLinks.map((link: any) => link.source_id))
    const counterIds = normalizeStringList(candidate.counterevidence_ids)
      .filter((id) => sourceById(sources, id) && linkedCounterIds.has(id))
    const layers = sourceLayersForSourceIds(sources, [...sourceIds, ...counterIds])
    const independentConfirmations = new Set([...sourceIds, ...counterIds]).size
    const highConfidence = candidate.trusted_grouping === true
      && layers.length >= 3
      && independentConfirmations >= 3
      && counterIds.length > 0
    return {
      id: candidate.id,
      claim: candidate.claim,
      claim_type: candidate.claim_type,
      importance: candidate.importance || (index < 2 ? 'critical' : 'high'),
      source_ids: sourceIds,
      local_evidence_ids: sources.filter((source) => source.layer === 'local_project_evidence' && normalizeStringList(source.claim_ids).includes(candidate.id)).map((source) => source.id),
     counterevidence_ids: counterIds,
      counterevidence_links: counterevidenceLinks.filter((link: any) => counterIds.includes(link.source_id)),
     triangulation: {
        source_layers: layers,
        independent_confirmation_count: independentConfirmations,
        conflicts: counterIds.length ? [`counterevidence:${counterIds.join(',')}`] : []
      },
      confidence: highConfidence ? 'high' : layers.length >= 2 && independentConfirmations >= 2 ? 'medium' : 'low',
      falsifiable: true,
      test_or_probe: candidate.test_or_probe || `Run a source-layer replication probe for ${candidate.id}.`
    }
  })
  const unsupported = claims
    .filter((claim) => {
      const important = claim.importance === 'high' || claim.importance === 'critical'
      return important && (claim.triangulation.source_layers.length < 2 || (claim.importance === 'critical' && claim.counterevidence_ids.length === 0))
    })
    .map((claim) => claim.id)
  const evidenceLinkedClaims = claims.filter((claim) => claim.source_ids.length > 0 || claim.counterevidence_ids.length > 0)
  return normalizeClaimEvidenceMatrix({
    schema: 'sks.claim-evidence-matrix.v1',
    mission_id: input.plan?.mission_id || '',
    claims,
    key_claim_ids: evidenceLinkedClaims.slice(0, 8).map((claim) => claim.id),
    unsupported_claims: unsupported,
    triangulated_claim_count: claims.filter((claim) => claim.triangulation.source_layers.length >= 2 && claim.triangulation.independent_confirmation_count >= 2).length,
    blockers: unsupported.map((id) => `unsupported_important_claim:${id}`)
  })
}

function usableEvidenceSource(source: any): boolean {
  if (!source || !String(source.id || '').trim()) return false
  if (source.stance !== 'supports' && source.stance !== 'undermines') return false
  if (deterministicFixtureSource(source)) return true
  return String(source?.acquisition_verdict || '') === 'verified_content'
    && /^verified_content:/i.test(String(source.credibility || ''))
    && source?.super_search_provenance?.validated === true
}

function deterministicFixtureSource(source: any): boolean {
  return /^(?:deterministic_fixture|selftest|mock)$/i.test(String(source?.kind || ''))
}

function claimTextFromSource(source: any, claimId: string): string {
  const notes = String(source?.notes || '').trim()
  if (notes) return `${claimId}: ${notes.slice(0, 220)}`
  return `${claimId}: Evidence row ${source?.id || 'unknown'} contributes to this research claim.`
}

function sourceById(sources: any[], id: string): any | null {
  return sources.find((source) => String(source?.id || '') === id) || null
}

function sourceLayersForSourceIds(sources: any[], ids: string[]): string[] {
  const idSet = new Set(ids)
  return [...new Set(sources.filter((source) => idSet.has(String(source?.id || ''))).map((source) => String(source?.layer || '')).filter(Boolean))]
}

function normalizeCounterevidenceLinks(value: any) {
  const rows = Array.isArray(value) ? value : []
  return rows.map((row: any) => ({
    source_id: String(row?.source_id || '').trim(),
    target_claim_id: String(row?.target_claim_id || '').trim(),
    contradiction_rationale: String(row?.contradiction_rationale || '').trim()
  })).filter((row: any) => row.source_id && row.target_claim_id && row.contradiction_rationale)
}

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

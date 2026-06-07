import { type ClaimEvidenceMatrix, normalizeClaimEvidenceMatrix } from './claim-evidence-matrix.js'

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
      test_or_probe: String(entry?.next_experiment || entry?.test_or_probe || '').trim()
    })
  }
  for (const source of sources) {
    const claimIds = normalizeStringList(source?.claim_ids)
    if (claimIds.length) {
      for (const claimId of claimIds) {
        const existing = candidates.get(claimId) || {
          id: claimId,
          claim: claimTextFromSource(source, claimId),
          claim_type: 'inference',
          importance: candidates.size < 2 ? 'critical' : candidates.size < 8 ? 'high' : 'medium',
          source_ids: [],
          counterevidence_ids: [],
          test_or_probe: ''
        }
        if (source?.stance === 'undermines') existing.counterevidence_ids = [...new Set([...(existing.counterevidence_ids || []), source.id])]
        else existing.source_ids = [...new Set([...(existing.source_ids || []), source.id])]
        if (!existing.test_or_probe) existing.test_or_probe = `Probe ${claimId} against supporting and undermining source layers.`
        candidates.set(claimId, existing)
      }
    } else if (String(source?.notes || '').trim()) {
      const id = `hypothesis-${candidates.size + 1}`
      candidates.set(id, {
        id,
        claim: String(source.notes).slice(0, 240),
        claim_type: 'hypothesis',
        importance: 'medium',
        source_ids: source?.stance === 'undermines' ? [] : [source.id].filter(Boolean),
        counterevidence_ids: source?.stance === 'undermines' ? [source.id].filter(Boolean) : [],
        test_or_probe: `Turn ${source.id || id} notes into a decisive source-backed probe.`
      })
    }
  }
  const falsificationCounterIds = new Set(
    (Array.isArray(input.falsificationLedger?.cases) ? input.falsificationLedger.cases : [])
      .flatMap((row: any) => [...normalizeStringList(row?.counterevidence_source_ids), ...normalizeStringList(row?.source_ids)])
  )
  const claims = [...candidates.values()].slice(0, Math.max(8, candidates.size)).map((candidate, index) => {
    const sourceIds = normalizeStringList(candidate.source_ids).filter((id) => sourceById(sources, id))
    const counterIds = normalizeStringList(candidate.counterevidence_ids).filter((id) => sourceById(sources, id) || falsificationCounterIds.has(id))
    const layers = sourceLayersForSourceIds(sources, [...sourceIds, ...counterIds])
    return {
      id: candidate.id,
      claim: candidate.claim,
      claim_type: candidate.claim_type,
      importance: candidate.importance || (index < 2 ? 'critical' : 'high'),
      source_ids: sourceIds,
      local_evidence_ids: sources.filter((source) => source.layer === 'local_project_evidence' && normalizeStringList(source.claim_ids).includes(candidate.id)).map((source) => source.id),
      counterevidence_ids: counterIds,
      triangulation: {
        source_layers: layers,
        independent_confirmation_count: layers.length,
        conflicts: counterIds.length ? [`counterevidence:${counterIds.join(',')}`] : []
      },
      confidence: layers.length >= 3 && counterIds.length ? 'high' : layers.length >= 2 ? 'medium' : 'low',
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
  return normalizeClaimEvidenceMatrix({
    schema: 'sks.claim-evidence-matrix.v1',
    mission_id: input.plan?.mission_id || '',
    claims,
    key_claim_ids: claims.slice(0, 8).map((claim) => claim.id),
    unsupported_claims: unsupported,
    triangulated_claim_count: claims.filter((claim) => claim.triangulation.source_layers.length >= 2).length,
    blockers: unsupported.map((id) => `unsupported_important_claim:${id}`)
  })
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

function normalizeStringList(value: any): string[] {
  return [...new Set((Array.isArray(value) ? value : value == null ? [] : [value]).map((item) => String(item || '').trim()).filter(Boolean))]
}

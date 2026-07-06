export interface RealEvidencePolicyResult {
  schema: 'sks.real-evidence-policy.v1'
  ok: boolean
  blockers: string[]
  warnings: string[]
}

export function evaluateRealEvidencePolicy(input: {
  productionMode?: boolean
  mode?: string
  sources?: any[]
  claims?: any[]
  proof?: any
}): RealEvidencePolicyResult {
  const productionMode = input.productionMode !== false
  const sources = Array.isArray(input.sources) ? input.sources : []
  const claims = Array.isArray(input.claims) ? input.claims : []
  const blockers: string[] = []
  const warnings: string[] = []
  const verifiedSources = sources.filter((source) => source?.acquisition_verdict === 'verified_content')
  const sourceIds = new Set(sources.map((source) => String(source?.source_id || '')).filter(Boolean))

  if (!sources.length) blockers.push('source_acquisition_unavailable')
  if (productionMode && sources.some((source) => sourceLooksMockOrFixture(source))) blockers.push('production_source_fixture_or_mock')
  if (productionMode && input.proof?.mock_only === true) blockers.push('production_proof_mock_only')
  if (Number(input.proof?.verified_source_count || 0) > 0 && verifiedSources.length === 0) blockers.push('verified_source_count_without_verified_sources')
  if (input.mode === 'url_acquisition' && !sources.some((source) => source?.canonical_url || source?.original_url)) blockers.push('missing_url_for_super_search_fetch')
  if (sources.length && verifiedSources.length === 0) blockers.push('verified_source_evidence_missing')

  for (const claim of claims) {
    const status = String(claim?.status || '')
    if (status !== 'supported' && status !== 'verified') continue
    const claimSourceIds: string[] = Array.isArray(claim?.source_ids) ? claim.source_ids.map(String).filter(Boolean) : []
    if (!claimSourceIds.length) {
      blockers.push('supported_claim_without_sources')
      continue
    }
    if (claimSourceIds.some((id) => !sourceIds.has(id))) blockers.push('supported_claim_missing_source_artifact')
    const verifiedClaimSources = sources.filter((source) => claimSourceIds.includes(String(source?.source_id || '')) && source?.acquisition_verdict === 'verified_content')
    if (!verifiedClaimSources.length) blockers.push('supported_claim_without_verified_source')
  }

  return {
    schema: 'sks.real-evidence-policy.v1',
    ok: blockers.length === 0,
    blockers: [...new Set(blockers)],
    warnings: [...new Set(warnings)]
  }
}

function sourceLooksMockOrFixture(source: any): boolean {
  const text = [
    source?.provider_id,
    source?.source_family,
    source?.source_type,
    source?.title,
    source?.content_artifact,
    ...(Array.isArray(source?.acquisition_path) ? source.acquisition_path : []),
    ...(Array.isArray(source?.warnings) ? source.warnings : [])
  ].join(' ')
  return source?.local_only_raw === true || /\b(mock|fixture|fake|stub|synthetic)\b/i.test(text)
}

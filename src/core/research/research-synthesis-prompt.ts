export function buildResearchSynthesisPrompt(input: {
  plan: any
  sourceLedger: any
  claimMatrix: any
  falsificationLedger: any
  implementationBlueprint: any
  experimentPlan: any
  replicationPack: any
  cycle: number
}): string {
  return [
    'You are writing the final SKS Research synthesis.',
    'Do not write a short summary.',
    'Do not pad with repeated paragraphs.',
    'Every key claim must cite source-ledger ids.',
    'In the Key Claims section, write every key claim id and its actual claim text in one local paragraph or table row, with at least one source id linked to that same claim in claim-evidence-matrix.json.',
    'A global References list does not satisfy claim coverage. Claim-local citations must appear beside the claim they support.',
    'Every recommendation must point to implementation-blueprint sections.',
    'Every limitation must point to falsification-ledger cases or source blockers.',
    'Return JSON only matching sks.research-synthesis-output.v1.',
    'Do not modify repository source.',
    'If evidence is insufficient, return blockers rather than confident prose.',
    '',
    `Mission: ${input.plan?.mission_id || 'unknown'}`,
    `Cycle: ${input.cycle}`,
    `Prompt: ${input.plan?.prompt || ''}`,
    '',
    'Compact evidence pack:',
    JSON.stringify(compactEvidencePack(input), null, 2).slice(0, 24000)
  ].join('\n')
}

function compactEvidencePack(input: any) {
  const sourceRows = [
    ...(Array.isArray(input.sourceLedger?.sources) ? input.sourceLedger.sources : []),
    ...(Array.isArray(input.sourceLedger?.counterevidence_sources) ? input.sourceLedger.counterevidence_sources : [])
  ]
  return {
    source_ids: sourceRows.map((source: any) => ({
      id: source.id,
      layer: source.layer,
      kind: source.kind,
      title: source.title,
      locator: source.locator,
      publisher_or_author: source.publisher_or_author,
      published_at: source.published_at || null,
      accessed_at: source.accessed_at || null,
      reliability: source.reliability,
      credibility: source.credibility,
      stance: source.stance,
      claim_ids: source.claim_ids || [],
      notes: source.notes || '',
      content_artifact: source.content_artifact || null,
      content_sha256: source.content_sha256 || null,
      content_length: source.content_length || null,
      acquisition_verdict: source.acquisition_verdict || null,
      domain: source.domain || null,
      authority_tier: source.authority_tier || null,
      primary_source: source.primary_source === true,
      independence_cluster_id: source.independence_cluster_id || null
    })),
    key_claims: (Array.isArray(input.claimMatrix?.claims) ? input.claimMatrix.claims : []).map((claim: any) => ({
      id: claim.id,
      claim: claim.claim,
      source_ids: claim.source_ids || [],
      counterevidence_ids: claim.counterevidence_ids || [],
      counterevidence_links: claim.counterevidence_links || [],
      test_or_probe: claim.test_or_probe || ''
    })),
    falsification_cases: Array.isArray(input.falsificationLedger?.cases) ? input.falsificationLedger.cases : [],
    blueprint_sections: (Array.isArray(input.implementationBlueprint?.sections) ? input.implementationBlueprint.sections : []).map((section: any) => ({
      id: section.id,
      title: section.title,
      target_paths: section.target_paths || [],
      acceptance_checks: section.acceptance_checks || []
    })),
    experiment_steps: Array.isArray(input.experimentPlan?.steps) ? input.experimentPlan.steps : [],
    replication_commands: Array.isArray(input.replicationPack?.commands) ? input.replicationPack.commands : []
  }
}

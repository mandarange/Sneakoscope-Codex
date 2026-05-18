// @ts-nocheck
export function linkProofClaimsToEvidence(proof = {}, evidenceIndex = {}) {
  const records = evidenceIndex.records || [];
  return (proof.claims || []).map((claim) => {
    const text = JSON.stringify(claim);
    const evidenceIds = records
      .filter((record) => record.path && text.includes(record.path))
      .map((record) => record.id);
    return evidenceIds.length ? { ...claim, evidence_ids: [...new Set([...(claim.evidence_ids || []), ...evidenceIds])] } : claim;
  });
}

export function proofEvidenceSummary(evidenceIndex = {}) {
  return {
    schema: 'sks.evidence-proof-link.v1',
    evidence_index: evidenceIndex.mission_id ? `.sneakoscope/missions/${evidenceIndex.mission_id}/evidence-index.json` : null,
    records: evidenceIndex.records?.length || 0,
    blocked_records: (evidenceIndex.records || []).filter((record) => record.trust === 'blocked').length,
    issues: evidenceIndex.issues || []
  };
}

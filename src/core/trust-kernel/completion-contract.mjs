import { validateCompletionProof } from '../proof/validation.mjs';

export function validateCompletionContract(contract = {}, proof = {}, evidenceIndex = {}) {
  const issues = [];
  const required = contract.required || {};
  if (contract.schema !== 'sks.route-completion-contract.v1') issues.push('contract_schema');
  if (required.completion_proof && proof?.schema !== 'sks.completion-proof.v1') issues.push('completion_proof_missing');
  const proofValidation = validateCompletionProof(proof || {});
  if (required.completion_proof && !proofValidation.ok) issues.push(...proofValidation.issues.map((issue) => `proof:${issue}`));
  if (required.completion_proof && proof.status === 'not_verified') issues.push('completion_proof_not_verified');
  if (required.image_voxels && !imageVoxelEvidenceOk(proof, evidenceIndex)) issues.push('image_voxel_anchor_missing');
  if (required.db_safety && !dbEvidenceOk(proof, evidenceIndex)) issues.push('db_safety_evidence_missing');
  if (required.scouts && proof.evidence?.scouts?.gate !== 'passed') issues.push('scout_gate_not_passed');
  if (evidenceIndex?.status === 'blocked') issues.push(...(evidenceIndex.issues || []).map((issue) => `evidence:${issue}`));
  if (proof.status === 'verified' && mockOrStaticEvidence(evidenceIndex)) issues.push('mock_or_static_evidence_cannot_verify_real_status');
  return {
    ok: issues.length === 0,
    status: issues.length ? 'blocked' : (proof.status || contract.status || 'not_verified'),
    issues: [...new Set(issues)]
  };
}

function imageVoxelEvidenceOk(proof = {}, evidenceIndex = {}) {
  const summary = proof.evidence?.image_voxels || {};
  const anchors = Number(summary.anchor_count ?? summary.anchors ?? 0);
  if (anchors > 0) return true;
  return (evidenceIndex.records || []).some((record) => record.kind === 'image_voxel' && record.trust !== 'blocked');
}

function dbEvidenceOk(proof = {}, evidenceIndex = {}) {
  return Boolean(proof.evidence?.db || proof.evidence?.db_safety)
    || (evidenceIndex.records || []).some((record) => record.kind === 'db_safety' && record.trust !== 'blocked');
}

function mockOrStaticEvidence(evidenceIndex = {}) {
  return (evidenceIndex.records || []).some((record) => record.source === 'mock' || record.source === 'static_contract');
}

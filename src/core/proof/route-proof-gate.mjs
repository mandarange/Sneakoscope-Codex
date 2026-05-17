import { containsPlaintextSecret } from '../secret-redaction.mjs';
import { readRouteProof } from './proof-reader.mjs';
import { validateCompletionProof } from './validation.mjs';
import { proofStatusBlocks, routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from './route-proof-policy.mjs';
import { routeRequiresScoutIntake } from '../scouts/scout-plan.mjs';

export async function validateRouteCompletionProof(root, { missionId = null, route = null, state = {}, visualClaim = undefined } = {}) {
  const proofRequired = state.proof_required === true || routeRequiresCompletionProof(route);
  if (!proofRequired) return { ok: true, required: false, status: 'not_required', issues: [] };
  const proof = await readRouteProof(root, missionId);
  if (!proof) {
    return {
      ok: false,
      required: true,
      status: 'blocked',
      issues: ['completion_proof_missing']
    };
  }
  const validation = validateCompletionProof(proof);
  const issues = [...validation.issues];
  if (proofStatusBlocks(proof.status)) issues.push(`proof_status_${proof.status}`);
  if (containsPlaintextSecret(proof)) issues.push('plaintext_secret');
  if (routeRequiresImageVoxelAnchors(route || proof.route, { visualClaim })) {
    const anchors = proof.evidence?.image_voxels?.anchors ?? proof.evidence?.image_voxels?.anchor_count ?? 0;
    if (Number(anchors) <= 0) issues.push('image_voxel_anchors_missing');
  }
  if ((state.scouts_required === true || proof.evidence?.scouts) && routeRequiresScoutIntake(route || proof.route, { task: state.prompt, noScouts: state.scouts_required === false })) {
    const scouts = proof.evidence?.scouts;
    if (!scouts) issues.push('scout_proof_evidence_missing');
    else {
      if (scouts.gate !== 'passed') issues.push('scout_gate_not_passed');
      if (Number(scouts.completed_scouts || 0) !== 5) issues.push('scout_count_not_5');
      if (scouts.read_only_confirmed !== true) issues.push('scout_read_only_not_confirmed');
    }
  }
  return {
    ok: issues.length === 0,
    required: true,
    status: issues.length ? 'blocked' : proof.status,
    issues,
    proof
  };
}

import { containsPlaintextSecret } from '../secret-redaction.js';
import { readRouteProof } from './proof-reader.js';
import { validateCompletionProof } from './validation.js';
import { proofStatusBlocks, routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';
import { routeRequiresAgentIntake } from '../agents/agent-plan.js';

export async function validateRouteCompletionProof(root: any, { missionId = null, route = null, state = {}, visualClaim = undefined }: any = {}) {
  const proofRequired = state.proof_required === true || routeRequiresCompletionProof(route);
  if (!proofRequired) return { ok: true, required: false, status: 'not_required', issues: [] };
  const proof: any = await readRouteProof(root, missionId);
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
  if ((state.agents_required === true || proof.evidence?.agents) && routeRequiresAgentIntake(route || proof.route, { task: state.prompt, noAgents: state.agents_required === false })) {
    const agents = proof.evidence?.agents;
    if (!agents) issues.push('agent_proof_evidence_missing');
    else {
      if (agents.status !== 'passed' && agents.ok !== true) issues.push('agent_gate_not_passed');
      if (Number(agents.agent_count || 0) !== 5) issues.push('agent_count_not_5');
      if (agents.all_sessions_closed !== true) issues.push('agent_sessions_not_closed');
    }
  }
  const wrongness = proof.evidence?.wrongness;
  const imageUxReferenceOnlyPartial = proof.status === 'verified_partial' && proof.evidence?.image_ux_review?.reference_only === true;
  if (Number(wrongness?.high_severity_active || 0) > 0 && !imageUxReferenceOnlyPartial) issues.push('active_wrongness_high');
  if (proof.status === 'verified' && Number(wrongness?.active_count || 0) > 0) issues.push('active_wrongness_requires_partial');
  return {
    ok: issues.length === 0,
    required: true,
    status: issues.length ? 'blocked' : proof.status,
    issues,
    proof
  };
}

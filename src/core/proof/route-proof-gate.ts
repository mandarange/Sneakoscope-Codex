import { containsPlaintextSecret } from '../secret-redaction.js';
import { readRouteProof } from './proof-reader.js';
import { validateCompletionProof } from './validation.js';
import { normalizeProofRoute, proofStatusBlocks, routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from './route-proof-policy.js';
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
  if (routeRequiresAgentIntake(route || proof.route, { task: state.prompt, noAgents: state.agents_required === false })) {
    const agents = proof.evidence?.agents;
    if (!agents) issues.push('agent_proof_evidence_missing');
    else {
      if (agents.status !== 'passed' || agents.ok !== true) issues.push('agent_gate_not_passed');
      const normalizedRoute = normalizeProofRoute(route || proof.route);
      const maxAgentCount = normalizedRoute === '$Naruto' ? 100 : 20;
      const agentCount = Number(agents.agent_count || 0);
      if (agentCount < 5) issues.push('agent_count_below_5');
      if (agentCount > maxAgentCount) issues.push(`agent_count_above_${maxAgentCount}`);
      if (agents.all_sessions_closed !== true) issues.push('agent_sessions_not_closed');
      if (agents.no_overlap_ok !== true) issues.push('agent_no_overlap_not_ok');
      if (agents.ledger_hash_chain_ok !== true) issues.push('agent_ledger_hash_chain_not_ok');
      if (agents.consensus_ok !== true) issues.push('agent_consensus_not_ok');
      if (agents.janitor_ok !== true) issues.push('agent_janitor_missing_or_not_ok');
      if (Array.isArray(agents.blockers) && agents.blockers.length) issues.push('agent_blockers_present');
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

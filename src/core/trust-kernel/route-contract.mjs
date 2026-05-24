import path from 'node:path';
import { writeJsonAtomic } from '../fsx.mjs';
import { missionDir } from '../mission.mjs';
import { routeRequiresCompletionProof, routeRequiresImageVoxelAnchors } from '../proof/route-proof-policy.mjs';
import { ROUTE_COMPLETION_CONTRACT_SCHEMA, trustKernelMetadata } from './trust-kernel-schema.mjs';
import { validateCompletionContract } from './completion-contract.mjs';

export function routeCompletionContractPath(root, missionId) {
  return path.join(missionDir(root, missionId), 'route-completion-contract.json');
}

export async function writeRouteCompletionContract(root, proof = {}, evidenceIndex = {}) {
  const contract = buildRouteCompletionContract(proof, evidenceIndex);
  const validation = validateCompletionContract(contract, proof, evidenceIndex);
  const out = { ...contract, validation };
  if (proof.mission_id) await writeJsonAtomic(routeCompletionContractPath(root, proof.mission_id), out);
  return out;
}

export function buildRouteCompletionContract(proof = {}, evidenceIndex = {}) {
  const required = routeRequirements(proof.route, proof);
  const missionId = proof.mission_id || null;
  const evidencePaths = evidencePathsForContract(missionId, proof, evidenceIndex, required);
  return {
    schema: ROUTE_COMPLETION_CONTRACT_SCHEMA,
    ...trustKernelMetadata(),
    mission_id: missionId,
    route: proof.route || null,
    required,
    evidence: evidencePaths,
    status: proof.status || 'not_verified'
  };
}

export function routeRequirements(route, proof = {}) {
  return {
    agents: Boolean(proof.evidence?.agents?.schema || proof.evidence?.agents?.ok || proof.evidence?.agents?.status),
    completion_proof: routeRequiresCompletionProof(route),
    image_voxels: routeRequiresImageVoxelAnchors(route),
    db_safety: route === '$DB' || Boolean(proof.evidence?.db || proof.evidence?.db_safety),
    tests: Boolean(proof.evidence?.tests),
    blackbox: Boolean(JSON.stringify(proof.evidence || {}).includes('blackbox'))
  };
}

function evidencePathsForContract(missionId, proof, evidenceIndex, required) {
  const base = missionId ? `.sneakoscope/missions/${missionId}` : null;
  return {
    agents: base && required.agents ? `${base}/agents/agent-proof-evidence.json` : null,
    proof: base ? `${base}/completion-proof.json` : null,
    image_voxels: required.image_voxels && base ? `${base}/image-voxel-ledger.json` : null,
    tests: pathFromEvidence(proof.evidence?.tests),
    db_safety: pathFromEvidence(proof.evidence?.db || proof.evidence?.db_safety),
    blackbox: pathFromEvidence(proof.evidence?.blackbox),
    evidence_index: base ? `${base}/evidence-index.json` : null,
    trust_report: base ? `${base}/trust-report.json` : null,
    evidence_records: (evidenceIndex.records || []).map((record) => ({ id: record.id, kind: record.kind, path: record.path, trust: record.trust }))
  };
}

function pathFromEvidence(value) {
  const row = Array.isArray(value) ? value.find(Boolean) : value;
  if (!row) return null;
  if (typeof row === 'string') return row;
  return row.path || row.report || row.evidence || null;
}

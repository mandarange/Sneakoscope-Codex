import { type EvidenceIndex } from '../evidence/evidence-schema.js';
import { type CompletionProof } from '../proof/proof-schema.js';
import { type TrustStatus } from './trust-kernel-schema.js';

export const ROUTE_COMPLETION_CONTRACT_SCHEMA = 'sks.route-completion-contract.v1' as const;

export interface RouteRequirements {
  completion_proof: boolean;
  evidence_index?: boolean;
  image_voxels?: boolean;
  db_safety?: boolean;
  scouts?: boolean;
  tests?: boolean;
}

export interface RouteCompletionContract {
  schema: typeof ROUTE_COMPLETION_CONTRACT_SCHEMA;
  mission_id: string | null;
  route: string | null;
  required: RouteRequirements;
  evidence: Record<string, unknown>;
  status: TrustStatus;
}

export interface RouteContractValidation {
  ok: boolean;
  status: TrustStatus;
  issues: string[];
}

export function validateRouteCompletionContract(
  contract: unknown,
  proof: CompletionProof | null,
  evidenceIndex: EvidenceIndex | null
): RouteContractValidation {
  const issues: string[] = [];
  const row = contract as Partial<RouteCompletionContract>;
  if (!row || typeof row !== 'object' || row.schema !== ROUTE_COMPLETION_CONTRACT_SCHEMA) issues.push('contract_schema');
  if (row.required?.completion_proof && proof?.schema !== 'sks.completion-proof.v1') issues.push('completion_proof_missing');
  if (row.required?.evidence_index && evidenceIndex?.schema !== 'sks.evidence-index.v1') issues.push('evidence_index_missing');
  if (proof?.status === 'verified' && evidenceIndex?.records.some((record) => record.source === 'mock' || record.source === 'static_contract')) {
    issues.push('mock_or_static_evidence_cannot_verify_real_status');
  }
  return { ok: issues.length === 0, status: issues.length ? 'blocked' : proof?.status || row.status || 'not_verified', issues };
}

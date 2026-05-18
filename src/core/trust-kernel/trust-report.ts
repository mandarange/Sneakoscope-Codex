import { type EvidenceIndex } from '../evidence/evidence-schema.js';
import { type CompletionProof } from '../proof/proof-schema.js';
import { type RouteCompletionContract } from './route-contract.js';
import { TRUST_REPORT_SCHEMA, type TrustStatus, trustKernelMetadata } from './trust-kernel-schema.js';

export interface TrustReport {
  schema: typeof TRUST_REPORT_SCHEMA;
  ok: boolean;
  mission_id: string | null;
  route: string | null;
  status: TrustStatus;
  proof_status: TrustStatus;
  evidence_status: TrustStatus;
  route_contract_status: TrustStatus;
  issues: string[];
}

export function buildTrustReport(input: {
  proof: CompletionProof;
  evidenceIndex: EvidenceIndex;
  contract: RouteCompletionContract;
  issues?: string[];
}): TrustReport & ReturnType<typeof trustKernelMetadata> {
  const issues = [...new Set(input.issues || [])];
  const status: TrustStatus = issues.length ? 'blocked' : input.proof.status;
  return {
    schema: TRUST_REPORT_SCHEMA,
    ...trustKernelMetadata(),
    ok: issues.length === 0 && status !== 'blocked' && status !== 'failed' && status !== 'not_verified',
    mission_id: input.proof.mission_id,
    route: input.proof.route,
    status,
    proof_status: input.proof.status,
    evidence_status: input.evidenceIndex.status,
    route_contract_status: input.contract.status,
    issues
  };
}

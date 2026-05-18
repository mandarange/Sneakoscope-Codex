import { type EvidenceRecord } from '../evidence/evidence-schema.js';
import { type TrustStatus } from '../trust-kernel/trust-kernel-schema.js';

export const COMPLETION_PROOF_SCHEMA = 'sks.completion-proof.v1' as const;

export interface ProofEvidence {
  commands?: unknown[];
  files?: unknown[];
  artifacts?: Array<string | { path: string; schema?: string }>;
  db_safety?: unknown;
  codex_app?: unknown;
  computer_use?: unknown;
  image_voxels?: unknown;
  scouts?: unknown;
  triwiki?: unknown;
  evidence_router?: { records: number };
  evidence_records?: EvidenceRecord[];
}

export interface ProofClaim {
  id: string;
  status: TrustStatus | 'supported' | 'unsupported';
  evidence?: string | null;
}

export interface CompletionProof {
  schema: typeof COMPLETION_PROOF_SCHEMA;
  mission_id: string | null;
  route: string | null;
  status: TrustStatus;
  evidence: ProofEvidence;
  claims: ProofClaim[];
  unverified: string[];
  blockers: string[];
}

export function isCompletionProof(value: unknown): value is CompletionProof {
  if (!value || typeof value !== 'object') return false;
  const proof = value as Partial<CompletionProof>;
  return proof.schema === COMPLETION_PROOF_SCHEMA
    && typeof proof.status === 'string'
    && typeof proof.evidence === 'object'
    && Array.isArray(proof.claims)
    && Array.isArray(proof.unverified)
    && Array.isArray(proof.blockers);
}

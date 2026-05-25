import { PACKAGE_VERSION, nowIso } from '../fsx.js';

export const COMPLETION_PROOF_SCHEMA = 'sks.completion-proof.v1';
export const COMPLETION_PROOF_STATUSES = Object.freeze([
  'verified',
  'verified_partial',
  'blocked',
  'not_verified',
  'failed'
]);

export function emptyCompletionProof(overrides: Record<string, unknown> = {}) {
  return {
    schema: COMPLETION_PROOF_SCHEMA,
    version: PACKAGE_VERSION,
    generated_at: nowIso(),
    mission_id: null,
    route: null,
    status: 'not_verified',
    summary: {
      files_changed: 0,
      commands_run: 0,
      tests_passed: 0,
      tests_failed: 0,
      manual_review_required: true
    },
    evidence: {
      commands: [],
      files: [],
      db_safety: null,
      codex_app: null,
      computer_use: null,
      image_voxels: null,
      agents: null,
      triwiki: null,
      wrongness: null,
      source_intelligence: null,
      goal_mode: null
    },
    claims: [],
    unverified: [],
    blockers: [],
    next_human_actions: [],
    ...overrides
  };
}


export interface ProofEvidence {
  commands?: unknown[];
  files?: unknown[];
  artifacts?: Array<string | { path: string; schema?: string }>;
  db_safety?: unknown;
  codex_app?: unknown;
  computer_use?: unknown;
  image_voxels?: unknown;
  agents?: unknown;
  triwiki?: unknown;
  wrongness?: unknown;
  source_intelligence?: unknown;
  goal_mode?: unknown;
  evidence_router?: { records: number };
  evidence_records?: import('../evidence/evidence-schema.js').EvidenceRecord[];
}

export interface ProofClaim {
  id: string;
  status: import('../trust-kernel/trust-kernel-schema.js').TrustStatus | 'supported' | 'unsupported';
  evidence?: string | null;
  wrongness?: string[];
}

export interface CompletionProof {
  schema: typeof COMPLETION_PROOF_SCHEMA;
  mission_id: string | null;
  route: string | null;
  status: import('../trust-kernel/trust-kernel-schema.js').TrustStatus;
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

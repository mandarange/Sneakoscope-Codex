import { EVIDENCE_SCHEMA } from '../../src/core/evidence/evidence-schema.js';
import {
  COMPLETION_PROOF_SCHEMA,
  isCompletionProof,
  type CompletionProof
} from '../../src/core/proof/proof-schema.js';

const proof: CompletionProof = {
  schema: COMPLETION_PROOF_SCHEMA,
  mission_id: 'M-type-test',
  route: '$Naruto',
  status: 'verified_partial',
  evidence: {
    artifacts: [{ path: '.sneakoscope/missions/M-type-test/completion-proof.json', schema: COMPLETION_PROOF_SCHEMA }],
    evidence_router: { records: 1 },
    evidence_records: [{
      schema: EVIDENCE_SCHEMA,
      id: 'proof-evidence-001',
      mission_id: 'M-type-test',
      kind: 'proof',
      source: 'real',
      path: '.sneakoscope/missions/M-type-test/completion-proof.json',
      sha256: null,
      freshness: 'fresh',
      trust: 'high',
      redacted: false,
      issues: []
    }]
  },
  claims: [{ id: 'claim-001', status: 'supported', evidence: 'proof-evidence-001' }],
  unverified: [],
  blockers: []
};

const guardResult: boolean = isCompletionProof(proof);

void guardResult;

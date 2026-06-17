import { hashJson } from './triwiki-cache-key.js';

export const TRIWIKI_PROOF_CARD_SCHEMA = 'sks.triwiki-proof-card.v1';

export type TriWikiProofSubjectType = 'gate' | 'gate-pack' | 'module' | 'pipeline';
export type TriWikiProofResult = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface TriWikiProofCardInput {
  subject_type: TriWikiProofSubjectType;
  subject_id: string;
  cache_key: string;
  input_hash: string;
  implementation_hash: string;
  tool_version: string;
  fixture_version: string;
  result: TriWikiProofResult;
  reusable: boolean;
  evidence: Record<string, unknown>;
  invalidation_reasons?: string[];
  expires_at?: string | null;
  duration_ms?: number;
}

export interface TriWikiProofCard extends TriWikiProofCardInput {
  schema: typeof TRIWIKI_PROOF_CARD_SCHEMA;
  proof_id: string;
  created_at: string;
}

export function createTriWikiProofCard(input: TriWikiProofCardInput): TriWikiProofCard {
  const base: Omit<TriWikiProofCard, 'proof_id' | 'created_at'> = {
    schema: TRIWIKI_PROOF_CARD_SCHEMA,
    subject_type: input.subject_type,
    subject_id: input.subject_id,
    cache_key: input.cache_key,
    input_hash: input.input_hash,
    implementation_hash: input.implementation_hash,
    tool_version: input.tool_version,
    fixture_version: input.fixture_version,
    result: input.result,
    reusable: input.reusable,
    evidence: input.evidence,
    invalidation_reasons: input.invalidation_reasons || [],
    expires_at: input.expires_at ?? null,
    duration_ms: input.duration_ms ?? 0
  };
  return {
    ...base,
    proof_id: proofIdFor(base),
    created_at: new Date().toISOString()
  };
}

export function proofIdFor(value: Omit<TriWikiProofCard, 'proof_id' | 'created_at'>): string {
  return `proof-${hashJson(value).slice(0, 24)}`;
}

export function isReusableTriWikiProofCard(card: TriWikiProofCard, now = new Date()): boolean {
  if (card.schema !== TRIWIKI_PROOF_CARD_SCHEMA) return false;
  if (card.reusable !== true) return false;
  if (card.result !== 'passed') return false;
  if ((card.invalidation_reasons || []).length > 0) return false;
  if (card.expires_at && new Date(card.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

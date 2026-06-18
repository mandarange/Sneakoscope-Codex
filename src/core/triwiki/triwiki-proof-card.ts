import { hashJson } from './triwiki-cache-key.js';

export const TRIWIKI_PROOF_CARD_SCHEMA = 'sks.triwiki-proof-card.v1';

export type TriWikiProofSubjectType = 'gate' | 'gate-pack' | 'module' | 'pipeline';
export type TriWikiProofResult = 'passed' | 'failed' | 'skipped' | 'blocked';

export interface TriWikiProofCardInput {
  subject_type: TriWikiProofSubjectType;
  subject_id: string;
  cache_key: string;
  input_hash: string;
  implementation_hash?: string;
  gate_impl_hash?: string;
  package_lock_hash?: string;
  release_gates_hash?: string;
  env_allowlist_hash?: string;
  tool_versions?: Record<string, string>;
  tool_version?: string;
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
    implementation_hash: input.implementation_hash || input.gate_impl_hash || 'unknown',
    gate_impl_hash: input.gate_impl_hash || input.implementation_hash || 'unknown',
    package_lock_hash: input.package_lock_hash || 'legacy-missing',
    release_gates_hash: input.release_gates_hash || 'legacy-missing',
    env_allowlist_hash: input.env_allowlist_hash || 'legacy-missing',
    tool_versions: input.tool_versions || (input.tool_version ? { sks: input.tool_version } : {}),
    tool_version: input.tool_version || input.tool_versions?.sks || 'unknown',
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
  return `proof-${hashJson({
    subject_type: value.subject_type,
    subject_id: value.subject_id,
    cache_key: value.cache_key,
    input_hash: value.input_hash,
    gate_impl_hash: value.gate_impl_hash || value.implementation_hash,
    package_lock_hash: value.package_lock_hash,
    release_gates_hash: value.release_gates_hash,
    env_allowlist_hash: value.env_allowlist_hash,
    tool_versions: value.tool_versions,
    fixture_version: value.fixture_version
  }).slice(0, 24)}`;
}

export function isReusableTriWikiProofCard(card: TriWikiProofCard, now = new Date()): boolean {
  if (card.schema !== TRIWIKI_PROOF_CARD_SCHEMA) return false;
  if (!hasV401InvalidationMaterial(card)) return false;
  if (card.reusable !== true) return false;
  if (card.result !== 'passed') return false;
  if ((card.invalidation_reasons || []).length > 0) return false;
  if (card.expires_at && new Date(card.expires_at).getTime() <= now.getTime()) return false;
  return true;
}

export function classifyTriWikiProofCardSchema(card: Partial<TriWikiProofCard>): 'current' | 'legacy_proof_card_schema' | 'invalid' {
  if (card.schema !== TRIWIKI_PROOF_CARD_SCHEMA) return 'invalid';
  return hasV401InvalidationMaterial(card) ? 'current' : 'legacy_proof_card_schema';
}

function hasV401InvalidationMaterial(card: Partial<TriWikiProofCard>): boolean {
  return Boolean(
    card.gate_impl_hash &&
    card.package_lock_hash &&
    card.release_gates_hash &&
    card.env_allowlist_hash &&
    card.tool_versions &&
    Object.keys(card.tool_versions).length > 0
  );
}

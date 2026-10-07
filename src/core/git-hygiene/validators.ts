import fsp from 'node:fs/promises';
import { GIT_POLICY_SCHEMA, SHARED_MEMORY_MANIFEST_SCHEMA, type SksGitPolicy, type SharedMemoryManifest } from './git-policy.js';
import { isMockPositiveSharedClaim, sharedRecordHasSecret } from './shared-memory-security.js';
import { asRecordOrEmpty as asRecord } from '../json/records.js';
import { validateCanonicalMemoryMetadata, validateMemoryTombstone } from '../artifact-schemas.js';
import { stableDigest } from '../decisions/state.js';

export interface ValidationResult {
  ok: boolean;
  checked: number;
  issues: string[];
}

export function validateGitPolicy(policy: unknown): ValidationResult {
  const issues: string[] = [];
  const row = asRecord(policy);
  if (row.schema !== GIT_POLICY_SCHEMA) issues.push('schema');
  if (!['solo', 'work', 'strict-work', 'ci'].includes(String(row.mode || ''))) issues.push('mode');
  if (!Array.isArray(asRecord(row.shared_memory).track)) issues.push('shared_memory.track');
  if (!Array.isArray(asRecord(row.local_runtime).ignore)) issues.push('local_runtime.ignore');
  if (!Number.isFinite(Number(asRecord(row.large_artifacts).max_tracked_file_bytes))) issues.push('large_artifacts.max_tracked_file_bytes');
  return { ok: issues.length === 0, checked: 1, issues };
}

export function validateSharedMemoryManifest(manifest: unknown): ValidationResult {
  const issues: string[] = [];
  const row = asRecord(manifest) as Partial<SharedMemoryManifest>;
  if (row.schema !== SHARED_MEMORY_MANIFEST_SCHEMA) issues.push('schema');
  if (!Array.isArray(row.shared_memory_plane)) issues.push('shared_memory_plane');
  if (!Array.isArray(row.local_runtime_plane)) issues.push('local_runtime_plane');
  return { ok: issues.length === 0, checked: 1, issues };
}

export function validateSharedRecord(record: unknown, policy?: SksGitPolicy): ValidationResult {
  const issues: string[] = [];
  const row = asRecord(record);
  const schema = String(row.schema || '');
  if (![
    'sks.triwiki-claim-record.v1',
    'sks.triwiki-wrongness-record.v1',
    'sks.triwiki-wrongness.v1',
    'sks.image-voxel-record.v1',
    'sks.avoidance-rule-record.v1',
    'sks.memory-tombstone.v1'
  ].includes(schema)) issues.push(`schema:${schema || 'missing'}`);
  if (schema === 'sks.memory-tombstone.v1') {
    const validation = validateMemoryTombstone(record);
    issues.push(...validation.errors);
  }
  if (row.memory_metadata !== undefined) {
    const validation = validateCanonicalMemoryMetadata(row.memory_metadata);
    if (!validation.ok) issues.push(...validation.errors.map((issue: string) => `memory_metadata:${issue}`));
    else {
      const metadata = asRecord(row.memory_metadata);
      const intake = asRecord(metadata.intake);
      for (const key of ['memory_id', 'mission_id', 'disposition', 'scope', 'lifecycle_state', 'ttl', 'source_kind', 'idempotency_key', 'policy_revision', 'source_digest', 'created_at']) {
        if (row[key] !== intake[key]) issues.push(`memory_binding:${key}`);
      }
      if (row.effective_trust !== metadata.effective_trust || row.trust_score !== metadata.effective_trust) issues.push('memory_binding:trust');
      if (row.evidence_digest !== intake.text_hash || stableDigest(row.evidence_refs) !== stableDigest(intake.evidence_refs)
        || stableDigest(row.evidence_hashes) !== stableDigest(intake.evidence_hashes)) issues.push('memory_binding:evidence');
      const text = schema === 'sks.triwiki-wrongness-record.v1' ? asRecord(asRecord(row.wrongness).claim).text : asRecord(row.claim).text;
      if (stableDigest(text) !== intake.text_hash) issues.push('memory_binding:text');
    }
  }
  if (!String(row.id || '').trim()) issues.push('id');
  if (policy?.security?.block_secret_patterns && sharedRecordHasSecret(record)) issues.push('secret');
  if (policy?.security?.block_mock_real_confusion && isMockPositiveSharedClaim(record)) issues.push('mock_positive_claim');
  return { ok: issues.length === 0, checked: 1, issues };
}

export async function validateSharedRecordFile(file: string, policy?: SksGitPolicy): Promise<ValidationResult> {
  try {
    const record = JSON.parse(await fsp.readFile(file, 'utf8'));
    return validateSharedRecord(record, policy);
  } catch (err) {
    return { ok: false, checked: 1, issues: [`invalid_json:${err instanceof Error ? err.message : String(err)}`] };
  }
}

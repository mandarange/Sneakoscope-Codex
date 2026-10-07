import fsp from 'node:fs/promises';
import path from 'node:path';
import { sha256, writeJsonAtomic } from '../fsx.js';
import { withFileLock } from '../locks/file-lock.js';
import { ensureConfinedDirectory, inspectConfinedPath } from '../managed-path-safety.js';
import { JEV_MEMORY_LIMITS, MEMORY_ID, memoryRelativePath, validateJevMemoryIntake, type JevMemoryIntake } from '../artifact-schemas.js';
import { redactDecisionText, stableDigest } from '../decisions/state.js';
import { MEMORY_POLICY_REVISION, type MemoryDisposition } from '../decisions/types.js';
import { MEMORY_TTL_SECONDS, memoryDispositionPolicy, sensitiveMemoryInput } from '../memory-governor.js';
import { containsPlaintextSecret } from '../secret-redaction.js';

export interface JevMemoryIntakeInput {
  missionId: string;
  turnId: string;
  workflowRunId?: string | null;
  sessionId?: string | null;
  disposition: MemoryDisposition;
  scope?: 'mission' | 'project' | 'user' | 'route';
  text?: string | null;
  sourceKind?: JevMemoryIntake['source_kind'];
  sourceDigest?: string | null;
  contextGraphHash?: string | null;
  evidenceRefs?: readonly string[];
  evidenceHashes?: Record<string, string> | null;
  /** A policy-filtered candidate. Supplying this avoids reparsing a raw prompt. */
  candidateText?: string | null;
  imageVoxelRefs?: JevMemoryIntake['image_voxel_refs'];
  jevDecisionDigest?: string | null;
  createdAt?: string;
  idempotencyKey?: string | null;
}

/** Build a bounded, raw-free envelope. The caller still needs an explicit
 * mission and the existing publisher gate before anything becomes canonical. */
export function buildJevMemoryIntake(input: JevMemoryIntakeInput): JevMemoryIntake {
  if (!MEMORY_ID.test(input.missionId) || !MEMORY_ID.test(input.turnId)) throw new Error('memory_identity_invalid');
  const sourceText = String(input.text || '');
  if (sensitiveMemoryInput(sourceText) || /\b(?:password|passwd|secret|credential|token|api[ _-]?key|private key)\s*[:=]/i.test(sourceText)) throw new Error('memory_redaction_failed');
  const explicitCandidate = String(input.candidateText || '')
    || memoryDispositionPolicy({ prompt: sourceText, missionId: input.missionId, enabled: true, sourceFresh: true, graphFresh: true }).candidate
    || '';
  const candidateEvidenceRefs = [...new Set((input.evidenceRefs || []).filter((ref) => typeof ref === 'string' && memoryRelativePath(ref)).map(String))].slice(0, JEV_MEMORY_LIMITS.evidence);
  const boundedText = explicitCandidate || (['visual_evidence', 'negative_evidence'].includes(input.disposition) && candidateEvidenceRefs.length
    ? `${input.disposition} evidence ${stableDigest(candidateEvidenceRefs).slice(0, 24)}`
    : '');
  const redacted = redactDecisionText(boundedText, JEV_MEMORY_LIMITS.textChars);
  if (!redacted || containsPlaintextSecret(redacted)) throw new Error('memory_redaction_failed');
  const createdAt = input.createdAt || new Date().toISOString();
  // A missing source/graph binding is not fresh. Never manufacture an
  // "unknown" digest: doing so would let an unbound candidate be promoted.
  const sourceDigest = input.sourceDigest && /^[a-f0-9]{64}$/.test(input.sourceDigest) ? input.sourceDigest : '';
  const contextGraphHash = input.contextGraphHash && /^[a-f0-9]{64}$/.test(input.contextGraphHash) ? input.contextGraphHash : '';
  if (!sourceDigest || !contextGraphHash) throw new Error('memory_snapshot_binding_required');
  const textHash = stableDigest(redacted);
  const scope = input.disposition === 'mission_memory' ? 'mission' : input.scope || 'project';
  const workflowRunId = input.workflowRunId || `run-${input.missionId}`;
  if (!MEMORY_ID.test(workflowRunId)) throw new Error('memory_workflow_id_invalid');
  const candidateDigest = stableDigest({ text: textHash, scope, source: sourceDigest });
  const idempotencyKey = input.idempotencyKey && /^[a-f0-9]{64}$/.test(input.idempotencyKey)
    ? input.idempotencyKey
    : stableDigest({ workflow: workflowRunId, turn: input.turnId, candidate: candidateDigest });
  const memoryId = candidateDigest;
  const evidenceRefs = candidateEvidenceRefs;
  const imageVoxelRefs = (input.imageVoxelRefs || []).slice(0, JEV_MEMORY_LIMITS.images).map((ref) => ({ ...ref }));
  const entry: JevMemoryIntake = {
    schema: 'sks.jev-memory-intake.v1',
    memory_id: memoryId,
    idempotency_key: idempotencyKey,
    workflow_run_id: workflowRunId,
    candidate_digest: candidateDigest,
    mission_id: input.missionId,
    turn_id: input.turnId,
    session_id_hash: stableDigest({ mission: input.missionId, session: String(input.sessionId || '') }),
    disposition: input.disposition,
    scope,
    text_redacted: redacted,
    text_hash: textHash,
    source_kind: input.sourceKind || 'user_prompt',
    source_digest: sourceDigest,
    evidence_refs: evidenceRefs,
    evidence_hashes: Object.fromEntries(evidenceRefs.map(ref => [ref, input.evidenceHashes?.[ref] || ''])),
    context_graph_hash: contextGraphHash,
    jev_decision: input.jevDecisionDigest && /^[a-f0-9]{64}$/.test(input.jevDecisionDigest) ? { digest: input.jevDecisionDigest } : null,
    image_voxel_refs: imageVoxelRefs,
    lifecycle_state: 'ACTIVE',
    ttl: MEMORY_TTL_SECONDS[input.disposition] ?? 0,
    created_at: createdAt,
    policy_revision: MEMORY_POLICY_REVISION,
    redaction_status: { status: 'pass', rule_digest: stableDigest({ policy: MEMORY_POLICY_REVISION, bounded: true }) },
    promotion_status: input.disposition === 'needs_confirmation' ? 'needs_confirmation' : 'staged'
  };
  const validation = validateJevMemoryIntake(entry);
  if (!validation.ok) throw new Error(`memory_intake_invalid:${validation.errors.join(',')}`);
  return entry;
}

export function jevMemoryIntakePath(root: string, missionId: string) {
  if (!MEMORY_ID.test(missionId)) throw new Error('memory_mission_id_invalid');
  return path.join(root, '.sneakoscope', 'missions', missionId, 'jev-memory-intake.json');
}

export async function readJevMemoryIntake(root: string, missionId: string): Promise<JevMemoryIntake[]> {
  const file = jevMemoryIntakePath(root, missionId);
  const inspected = await inspectConfinedPath(root, file);
  if (!inspected.exists) return [];
  if (inspected.leafSymlink || !inspected.stat?.isFile() || inspected.stat.size > JEV_MEMORY_LIMITS.fileBytes) throw new Error('memory_intake_path_or_size');
  const rows: unknown = JSON.parse(await fsp.readFile(file, 'utf8'));
  if (!Array.isArray(rows) || rows.length > JEV_MEMORY_LIMITS.entries || rows.some((row) => !validateJevMemoryIntake(row).ok || row.mission_id !== missionId)) throw new Error('memory_intake_invalid');
  return rows;
}

/** The hook's only memory writer: ignored mission intake, never a canonical path. */
export async function stageJevMemoryIntake(root: string, entry: JevMemoryIntake) {
  if (['sensitive_no_store', 'keep_baseline', 'ephemeral_turn'].includes(entry.disposition)) throw new Error('memory_disposition_not_stageable');
  const validation = validateJevMemoryIntake(entry);
  if (!validation.ok) throw new Error(`memory_intake_invalid:${validation.errors.join(',')}`);
  if (entry.evidence_refs.length) {
    const evidence = await validateJevMemoryEvidence(root, entry);
    if (!evidence.ok) throw new Error(`memory_evidence_invalid:${evidence.issues.join('|')}`);
  }
  const file = jevMemoryIntakePath(root, entry.mission_id);
  const mission = path.dirname(file);
  const existingMission = await inspectConfinedPath(root, mission);
  if (!existingMission.exists || existingMission.leafSymlink || !existingMission.stat?.isDirectory()) throw new Error('memory_mission_missing');
  const lock = path.join(root, '.sneakoscope', 'state', 'locks', `memory-${stableDigest(entry.mission_id)}.lock`);
  await ensureConfinedDirectory(root, path.dirname(lock));
  if ((await inspectConfinedPath(root, lock)).leafSymlink) throw new Error('memory_lock_symlink');
  return withFileLock({ lockPath: lock, timeoutMs: 2000, staleMs: 30000 }, async () => {
    const rows = await readJevMemoryIntake(root, entry.mission_id);
    const prior = rows.find((row) => row.idempotency_key === entry.idempotency_key);
    if (prior) {
      if (prior.memory_id !== entry.memory_id || prior.text_hash !== entry.text_hash || prior.source_digest !== entry.source_digest) throw new Error('memory_idempotency_conflict');
      return { staged: false, duplicate: true, memory_id: prior.memory_id };
    }
    if (rows.length >= JEV_MEMORY_LIMITS.entries) throw new Error('memory_intake_capacity');
    const next = [...rows, entry].sort((a, b) => a.idempotency_key.localeCompare(b.idempotency_key));
    if (Buffer.byteLength(JSON.stringify(next, null, 2)) > JEV_MEMORY_LIMITS.fileBytes) throw new Error('memory_intake_capacity');
    if ((await inspectConfinedPath(root, file)).leafSymlink) throw new Error('memory_intake_symlink');
    await writeJsonAtomic(file, next, { mode: 0o600 });
    return { staged: true, duplicate: false, memory_id: entry.memory_id };
  });
}

/** Update an intake row under the same mission lock used by staging. Promotion
 * and retry paths must use this helper so concurrent hooks cannot lose rows. */
export async function updateJevMemoryIntake(
  root: string,
  missionId: string,
  update: (rows: JevMemoryIntake[]) => JevMemoryIntake[]
): Promise<JevMemoryIntake[]> {
  const file = jevMemoryIntakePath(root, missionId);
  const lock = path.join(root, '.sneakoscope', 'state', 'locks', `memory-${stableDigest(missionId)}.lock`);
  await ensureConfinedDirectory(root, path.dirname(lock));
  if ((await inspectConfinedPath(root, lock)).leafSymlink) throw new Error('memory_lock_symlink');
  return withFileLock({ lockPath: lock, timeoutMs: 2000, staleMs: 30000 }, async () => {
    const rows = await readJevMemoryIntake(root, missionId);
    const next = update(rows).map((row) => {
      const validation = validateJevMemoryIntake(row);
      if (!validation.ok || row.mission_id !== missionId) throw new Error(`memory_intake_invalid:${validation.errors.join(',')}`);
      return row;
    });
    if (next.length > JEV_MEMORY_LIMITS.entries || Buffer.byteLength(JSON.stringify(next, null, 2)) > JEV_MEMORY_LIMITS.fileBytes) throw new Error('memory_intake_capacity');
    if ((await inspectConfinedPath(root, file)).leafSymlink) throw new Error('memory_intake_symlink');
    await writeJsonAtomic(file, next.sort((a, b) => a.idempotency_key.localeCompare(b.idempotency_key)), { mode: 0o600 });
    return next;
  });
}

/** Verify evidence references against the bytes that were actually staged. */
export async function validateJevMemoryEvidence(root: string, entry: JevMemoryIntake): Promise<{ ok: boolean; issues: string[] }> {
  const issues: string[] = [];
  for (const ref of entry.evidence_refs) {
    const inspected = await inspectConfinedPath(root, path.join(root, ref)).catch(() => null);
    if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) { issues.push(`${ref}:missing`); continue; }
    if (inspected.stat.size > 2 * 1024 * 1024) { issues.push(`${ref}:oversize`); continue; }
    const bytes = await fsp.readFile(path.join(root, ref));
    const digest = sha256(bytes);
    if (entry.evidence_hashes[ref] !== digest) issues.push(`${ref}:digest_mismatch`);
    if (/\.(?:json|jsonl|txt|md|log)$/i.test(ref)) {
      const text = bytes.toString('utf8');
      if (containsPlaintextSecret(text)) issues.push(`${ref}:secret`);
      if (/"(?:mock|mock_only|synthetic|fixture)"\s*:\s*true|"execution_class"\s*:\s*"(?:mock_fixture|static_contract|synthetic)"/i.test(text)) issues.push(`${ref}:non_production_evidence`);
    }
  }
  return { ok: issues.length === 0, issues };
}

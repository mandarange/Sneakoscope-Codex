import fsp from 'node:fs/promises';
import path from 'node:path';
import { exists, nowIso, readJson, sha256, writeJsonAtomic, writeTextAtomic } from '../fsx.js';
import { missionImageLedgerPath, readImageVoxelLedger, validateImageVoxelLedgerFiles } from '../wiki-image/image-voxel-ledger.js';
import { readWrongnessLedger } from '../triwiki-wrongness/wrongness-ledger.js';
import { createWrongnessRecord, deterministicWrongnessId, type WrongnessRecord } from '../triwiki-wrongness/wrongness-schema.js';
import { listSharedFiles } from './git-status.js';
import { ensureGitPolicy, ensureSharedMemoryDirs, readGitPolicy, type SksGitPolicy } from './git-policy.js';
import { isMockPositiveSharedClaim, redactSharedRecord, sharedRecordHasSecret } from './shared-memory-security.js';
import { validateGitPolicy, validateSharedMemoryManifest, validateSharedRecordFile } from './validators.js';
import { asRecordOrEmpty as asRecord } from '../json/records.js';
import { withTriWikiStateLock } from '../triwiki/triwiki-cleanup.js';
import { ensureConfinedDirectory, inspectConfinedPath, walkConfinedEntries } from '../managed-path-safety.js';
import { validateSharedRecord } from './validators.js';
import { rankMemoryOverlayItems } from '../triwiki-attention.js';
import { rebuildMemorySummaries } from '../memory-summary.js';
import { filterMemoryOverlay, type MemoryOverlayItem } from '../memory-governor.js';
import { readJevMemoryIntake, updateJevMemoryIntake, validateJevMemoryEvidence } from '../memory/jev-memory-intake.js';
import { memoryRelativePath, validateCanonicalMemoryMetadata, validateJevMemoryIntake, validateMemoryTombstone, type JevMemoryIntake } from '../artifact-schemas.js';
import { readDecisionConfig } from '../decisions/config.js';
import { graphFileDigest, sourceSnapshotDigest } from '../decisions/state.js';
import { validateWrongnessRecord } from '../triwiki-wrongness/wrongness-schema.js';
import { validateImageVoxelLedger } from '../wiki-image/validation.js';

/** These are canonical memory, never inputs to the code graph and never align garbage. */
export const CANONICAL_MEMORY_SUBTREES = Object.freeze(['records', 'wrongness', 'image-voxels', 'avoidance-rules', 'summaries', 'project-policy.json', 'image-voxel-ledger.json']);

/** Caller is align under the TriWiki lock; stage must be an unpublished generation. */
export async function preserveCanonicalMemory(root: string, stageWiki: string): Promise<Record<string, string>> {
  const policy = await readGitPolicy(root);
  const hashes: Record<string, string> = {};
  let bytes = 0;
  for (const relative of CANONICAL_MEMORY_SUBTREES) {
    const source = path.join(root, '.sneakoscope/wiki', relative);
    const walk = await walkConfinedEntries(root, source);
    if (walk.errors.length) throw new Error('align_canonical_path_invalid');
    for (const file of walk.entries) {
      const inspected = await inspectConfinedPath(root, file);
      if (inspected.leafSymlink || !inspected.stat?.isFile() || inspected.stat.size > policy.large_artifacts.max_tracked_file_bytes) throw new Error('align_canonical_path_or_size');
      bytes += inspected.stat.size;
      if (bytes > 32 * 1024 * 1024 || Object.keys(hashes).length >= 4096) throw new Error('align_canonical_budget');
      const raw = await fsp.readFile(file, 'utf8');
      if (sharedRecordHasSecret(raw)) throw new Error('align_canonical_secret');
      if (file.endsWith('image-voxel-ledger.json')) {
        const ledger = JSON.parse(raw) as JsonRecord;
        const shape = validateImageVoxelLedger(ledger, { root });
        const integrity = shape.ok ? await validateImageVoxelLedgerFiles(root, ledger) : { ok: false };
        if (!shape.ok || !integrity.ok) throw new Error('align_image_ledger_invalid');
      } else if (file.endsWith('.json') && relative !== 'project-policy.json') {
        const parsed = JSON.parse(raw) as JsonRecord;
        // Every JSON object under a canonical memory subtree is part of the
        // preserved surface. A missing or invalid schema is corruption and
        // must block the generation swap so the active surface remains intact.
        if (typeof parsed.schema !== 'string' || parsed.schema.length === 0 || !validateSharedRecord(parsed, policy).ok) throw new Error('align_canonical_invalid');
      }
      const rel = path.relative(path.join(root, '.sneakoscope/wiki'), file);
      const target = path.join(stageWiki, rel);
      await ensureConfinedDirectory(root, path.dirname(target));
      await fsp.copyFile(file, target);
      hashes[rel.split(path.sep).join('/')] = sha256(raw);
    }
  }
  return hashes;
}

type JsonRecord = Record<string, unknown>;

export interface SharedPublishOptions {
  redact?: boolean;
  target?: 'wiki' | 'wrongness' | 'all';
}

export interface SharedPublishResult {
  schema: 'sks.shared-memory-publish.v1';
  ok: boolean;
  target: 'wiki' | 'wrongness' | 'all';
  written: string[];
  skipped: string[];
  blockers: string[];
  indexes?: SharedIndexResult;
}

export interface SharedIndexResult {
  schema: 'sks.shared-memory-index.v1';
  ok: boolean;
  indexes: string[];
  claims: number;
  wrongness: number;
  image_voxels: number;
  avoidance_rules: number;
}

export interface SharedMemoryOverlayOptions {
  query?: string;
  missionId?: string | null;
  topK?: number;
  maxTokens?: number;
  highRisk?: boolean;
  scope?: 'mission' | 'project' | 'user' | 'route';
  now?: number;
  sourceDigest?: string | null;
  graphDigest?: string | null;
}

/**
 * The sole bounded reader for canonical memory. It never scans the code graph
 * or calls a model; lifecycle, provenance, and token limits are applied by
 * memory-governor after this canonical projection.
 */
export async function readSharedMemoryOverlay(root: string, opts: SharedMemoryOverlayOptions = {}) {
  const policy = await readGitPolicy(root);
  const currentSource = opts.sourceDigest === undefined ? await sourceSnapshotDigest(root).catch(() => null) : opts.sourceDigest;
  const currentGraph = opts.graphDigest === undefined ? await graphFileDigest(root).catch(() => null) : opts.graphDigest;
  const retrievalBudget = filterMemoryOverlay([], {
    ...(opts.highRisk === undefined ? {} : { highRisk: opts.highRisk }),
    ...(opts.topK === undefined ? {} : { topK: opts.topK }),
    ...(opts.maxTokens === undefined ? {} : { maxTokens: opts.maxTokens })
  });
  if (!currentSource || !currentGraph) {
    return {
      schema: 'sks.shared-memory-overlay.v1', available: false, unavailable: true,
      reason: 'source_or_graph_unavailable', issues: ['source_or_graph_unavailable'], items: [], tokens: 0,
      top_k: retrievalBudget.top_k, max_tokens: retrievalBudget.max_tokens, provenance_section: []
    };
  }
  const files = await listSharedFiles(root);
  const issues: string[] = [];
  const candidates: MemoryOverlayItem[] = [];
  const tombstoned = new Set<string>();
  for (const relPath of files.filter((file) => file.endsWith('.json'))) {
    const row = await readJson<JsonRecord | null>(path.join(root, relPath), null).catch(() => null);
    if (row?.schema !== 'sks.memory-tombstone.v1') continue;
    const tombstone = validateMemoryTombstone(row);
    if (!tombstone.ok) {
      issues.push(`${relPath}:invalid_tombstone`);
      continue;
    }
    tombstoned.add(row.memory_id as string);
  }
  for (const relPath of files.filter((file) => /\.json$/.test(file) && /\.sneakoscope\/wiki\/(records|wrongness|image-voxels|avoidance-rules|summaries)\//.test(file))) {
    const absolute = path.join(root, relPath);
    const inspected = await inspectConfinedPath(root, absolute).catch(() => null);
    if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile() || inspected.stat.size > policy.large_artifacts.max_tracked_file_bytes) {
      issues.push(`${relPath}:path_or_size`);
      continue;
    }
    const row = await readJson<JsonRecord | null>(absolute, null).catch(() => null);
    if (row?.schema === 'sks.memory-tombstone.v1') continue;
    if (!row || !validateSharedRecord(row, policy).ok) {
      issues.push(`${relPath}:invalid_record`);
      continue;
    }
    if (row.memory_metadata) {
      const metadata = validateCanonicalMemoryMetadata(row.memory_metadata);
      if (!metadata.ok) {
        issues.push(`${relPath}:invalid_memory_metadata`);
        continue;
      }
      const intake = asRecord(asRecord(row.memory_metadata).intake);
      if (!currentSource || intake.source_digest !== currentSource) {
        issues.push(`${relPath}:stale_source_binding`);
        continue;
      }
      if (!currentGraph || intake.context_graph_hash !== currentGraph) {
        issues.push(`${relPath}:stale_graph_binding`);
        continue;
      }
      const evidence = await validateJevMemoryEvidence(root, intake as unknown as JevMemoryIntake);
      if (!evidence.ok) { issues.push(`${relPath}:stale_evidence`); continue; }
    }
    const claim = asRecord(row.claim);
    const wrongness = asRecord(row.wrongness);
    const wrongnessClaim = asRecord(wrongness.claim);
    const anchor = asRecord(row.anchor);
    const image = asRecord(row.image);
    const text = String(row.text_redacted || claim.text || claim.claim || wrongnessClaim.text || wrongness.summary || wrongness.text || row.label || anchor.label || image.path || '').trim().slice(0, 512);
    if (tombstoned.has(String(row.memory_id || claim.memory_id || ''))) continue;
    const source = String(row.source || claim.source || wrongness.source || relPath).trim();
    const evidenceDigest = String(row.evidence_digest || row.text_hash || claim.text_hash || wrongness.evidence_digest || image.sha256 || '').trim();
    const sourceDigest = String(row.source_digest || claim.source_digest || wrongness.source_digest || image.sha256 || evidenceDigest).trim();
    const lifecycle = String(row.lifecycle_state || claim.lifecycle_state || wrongness.lifecycle_state || (row.status === 'pinned' ? 'PINNED' : 'ACTIVE'));
    const freshness = String(row.freshness || claim.freshness || wrongness.freshness || 'fresh') === 'stale' ? 'stale' : 'fresh';
    const trust = Number(row.effective_trust ?? row.trust_score ?? claim.trust_score ?? wrongness.trust_score ?? anchor.trust_score);
    const createdAt = String(row.created_at || row.generated_at || claim.created_at || wrongness.created_at || '');
    const ttl = Number(row.ttl ?? claim.ttl ?? wrongness.ttl ?? 86400);
    const evidenceRefs = [source, ...(Array.isArray(row.evidence_refs) ? row.evidence_refs : [])].filter((ref) => memoryRelativePath(ref));
    if (!text || !source || !/^[a-f0-9]{32,128}$/i.test(evidenceDigest) || !/^[a-f0-9]{32,128}$/i.test(sourceDigest) || !Number.isFinite(trust) || !createdAt) {
      // Existing code/wiki records remain valid shared memory inputs even when
      // they predate the Jev metadata extension. They are simply ineligible
      // for this memory overlay; a Jev-derived record with missing provenance
      // makes the overlay explicitly unavailable instead of receiving a
      // synthetic trust value.
      if (row.memory_id || row.memory_metadata || row.disposition || row.evidence_refs || claim.memory_id) issues.push(`${relPath}:invalid_provenance`);
      continue;
    }
    if (row.scope === 'mission' && (!opts.missionId || String(row.mission_id) !== opts.missionId)) continue;
    const memoryId = String(row.memory_id || row.id || stableId('memory', relPath));
    candidates.push({
      memory_id: memoryId,
      text,
      source,
      evidence_digest: evidenceDigest,
      source_digest: sourceDigest,
      lifecycle,
      freshness,
      effective_trust: Math.max(0, Math.min(1, trust)),
      scope: (['mission', 'project', 'user', 'route'].includes(String(row.scope)) ? String(row.scope) : 'project') as MemoryOverlayItem['scope'],
      created_at: createdAt,
      ttl: Math.max(1, Math.floor(ttl)),
      evidence_refs: evidenceRefs.slice(0, 16),
      image_voxel_refs: Array.isArray(row.image_voxel_refs) ? row.image_voxel_refs as MemoryOverlayItem['image_voxel_refs'] : []
    });
  }
  const ranked = rankMemoryOverlayItems(candidates, opts.query);
  const filtered = filterMemoryOverlay(ranked, opts);
  return {
    schema: 'sks.shared-memory-overlay.v1',
    available: issues.length === 0 && filtered.items.length > 0,
    unavailable: issues.length > 0 || filtered.items.length === 0,
    reason: issues.length ? 'canonical_memory_unavailable' : filtered.items.length === 0 ? 'canonical_memory_empty' : null,
    issues: [...new Set(issues)].sort(),
    items: filtered.items,
    tokens: filtered.tokens,
    top_k: filtered.top_k,
    max_tokens: filtered.max_tokens,
    provenance_section: filtered.items.map((item) => ({ memory_id: item.memory_id, source: item.source, evidence_refs: item.evidence_refs, evidence_digest: item.evidence_digest, source_digest: item.source_digest }))
  };
}

export async function publishSharedMemory(root: string, opts: SharedPublishOptions = {}): Promise<SharedPublishResult> {
  return withTriWikiStateLock(root, () => publishSharedMemoryLocked(root, opts));
}

export async function promoteJevMemoryIntake(root: string, missionId: string, opts: {
  memoryIds?: readonly string[];
  requireConfirmation?: boolean;
  sourceFresh?: boolean;
  explicit?: boolean;
  /** Command authority may pass an already validated source/graph binding. */
  sourceDigest?: string | null;
  graphDigest?: string | null;
  env?: NodeJS.ProcessEnv;
} = {}) {
  if (!missionId || missionId === 'latest') throw new Error('memory_mission_id_required');
  const config = await readDecisionConfig(opts.env || process.env);
  if (opts.explicit !== true) return { schema: 'sks.jev-memory-promotion.v1', ok: false, mission_id: missionId, promoted: [], rejected: ['explicit_promotion_required'] };
  if (config.memoryPromotion !== true || config.executionPolicy !== 'optimize') return { schema: 'sks.jev-memory-promotion.v1', ok: false, mission_id: missionId, promoted: [], rejected: ['memory_promotion_disabled'] };
  return withTriWikiStateLock(root, async () => {
    const policy = await ensureGitPolicy(root, { write: true });
    const rows = await readJevMemoryIntake(root, missionId);
    const currentSource = opts.sourceDigest || await sourceSnapshotDigest(root);
    const currentGraph = opts.graphDigest || await graphFileDigest(root);
    const wanted = opts.memoryIds?.length ? new Set(opts.memoryIds) : null;
    const rejected: string[] = [];
    const eligible: JevMemoryIntake[] = [];
    for (const row of rows) {
      if (wanted && !wanted.has(row.memory_id)) continue;
      if (row.promotion_status === 'promoted') continue;
      if (!['durable_preference', 'durable_policy', 'visual_evidence', 'negative_evidence'].includes(row.disposition)) {
        rejected.push(`${row.memory_id}:disposition_not_promotable`); continue;
      }
      if (!['ACTIVE', 'PINNED'].includes(row.lifecycle_state) || Date.parse(row.created_at) + row.ttl * 1000 <= Date.now()
        || ['rejected', 'tombstoned'].includes(row.promotion_status)) {
        rejected.push(`${row.memory_id}:lifecycle_not_promotable`); continue;
      }
      if (row.scope === 'mission' || row.scope === 'user' && config.allowUserMemory !== true) { rejected.push(`${row.memory_id}:scope_not_promotable`); continue; }
      if (row.disposition === 'durable_policy' && !row.evidence_refs.length) { rejected.push(`${row.memory_id}:policy_evidence_required`); continue; }
      const tombstonePath = path.join(root, '.sneakoscope/wiki/summaries/memory-tombstones', `${row.memory_id}.json`);
      if ((await inspectConfinedPath(root, tombstonePath)).exists) { rejected.push(`${row.memory_id}:tombstoned`); continue; }
      if (opts.requireConfirmation && row.promotion_status === 'needs_confirmation') { rejected.push(`${row.memory_id}:confirmation_required`); continue; }
      if (opts.sourceFresh === false || !currentSource || row.source_digest !== currentSource) { rejected.push(`${row.memory_id}:stale_source_binding`); continue; }
      if (!currentGraph || row.context_graph_hash !== currentGraph) { rejected.push(`${row.memory_id}:stale_graph_binding`); continue; }
      const evidenceBlocker = await validatePromotionEvidence(root, missionId, row);
      if (evidenceBlocker) { rejected.push(`${row.memory_id}:${evidenceBlocker}`); continue; }
      if (row.evidence_refs.length) {
        const evidence = await validateJevMemoryEvidence(root, row);
        if (!evidence.ok) { rejected.push(`${row.memory_id}:evidence:${evidence.issues.join('|')}`); continue; }
      }
      eligible.push(row);
    }
    if (rejected.length) return { schema: 'sks.jev-memory-promotion.v1', ok: false, mission_id: missionId, promoted: [], rejected };
    if (!eligible.length) return { schema: 'sks.jev-memory-promotion.v1', ok: true, mission_id: missionId, promoted: [], rejected: [], duplicate: true };

    const records: Array<{ row: JevMemoryIntake; file: string; record: JsonRecord; related?: Array<{ file: string; record: JsonRecord }> }> = [];
    for (const row of eligible) {
      const id = `jev-${row.memory_id}`;
      const effectiveTrust = row.disposition === 'visual_evidence' || row.disposition === 'negative_evidence' ? 0.72 : 0.62;
      const evidenceScore = Math.min(1, row.evidence_refs.length / 4 + (row.image_voxel_refs.length ? 0.25 : 0));
      const priority = row.disposition === 'durable_policy' ? 0.9 : row.disposition === 'negative_evidence' ? 0.8 : 0.7;
      const memoryMetadata = { intake: row, effective_trust: effectiveTrust, evidence_score: evidenceScore, priority };
      const metadataValidation = validateCanonicalMemoryMetadata(memoryMetadata);
      if (!metadataValidation.ok) {
        rejected.push(`${row.memory_id}:memory_metadata:${metadataValidation.errors.join('|')}`);
        continue;
      }
      const source = `.sneakoscope/missions/${missionId}/jev-memory-intake.json`;
      const record = row.disposition === 'negative_evidence'
        ? prepareRecord({
          schema: 'sks.triwiki-wrongness-record.v1',
          id,
          memory_id: row.memory_id,
          mission_id: missionId,
          disposition: row.disposition,
          scope: row.scope,
          lifecycle_state: row.lifecycle_state,
          priority,
          ttl: row.ttl,
          source_kind: row.source_kind,
          idempotency_key: row.idempotency_key,
          jev_decision_digest: row.jev_decision?.digest || null,
          policy_revision: row.policy_revision,
          image_voxel_refs: row.image_voxel_refs,
          memory_metadata: memoryMetadata,
          generated_at: nowIso(),
          created_at: row.created_at,
          source,
          source_digest: row.source_digest,
          evidence_digest: row.text_hash,
          evidence_refs: row.evidence_refs,
          evidence_hashes: row.evidence_hashes,
          trust_score: effectiveTrust,
          effective_trust: effectiveTrust,
          path: `.sneakoscope/wiki/wrongness/${id}.json`,
          avoidance_rule_id: deterministicWrongnessId(['jev-avoid', row.memory_id]),
          wrongness: createWrongnessRecord({
            id,
            mission_id: missionId,
            created_at: row.created_at,
            status: 'active',
            truth_status: 'uncertain',
            wrongness_kind: 'incorrect_claim',
            severity: 'medium',
            claim: { id: row.memory_id, text: row.text_redacted, prior_status: null, linked_claim_ids: [] },
            detected_by: { source: 'jev_memory_intake', artifact: row.evidence_refs[0] || null, command: null, detail: 'verified negative evidence' },
            root_cause: { category: 'ambiguous_user_request', explanation: 'A verified negative memory candidate requires an avoidance rule.', contributing_factors: [] },
            corrective_action: { summary: 'Review the linked evidence before relying on this claim.', required_evidence: row.evidence_refs, patch_status: 'pending' },
            avoidance_rule: { id: deterministicWrongnessId(['jev-avoid', row.memory_id]), text: row.text_redacted, applies_to: [], severity: 'medium' },
            correction: { summary: null, corrected_anchor: null, corrected_claim: null },
            links: { proof_ids: [], evidence_ids: row.evidence_refs, files: [], tests: [], artifacts: row.evidence_refs, supersedes: [] }
          })
        }, { redact: true })
        : prepareRecord({
          schema: 'sks.triwiki-claim-record.v1',
          id,
          memory_id: row.memory_id,
          mission_id: missionId,
          disposition: row.disposition,
          scope: row.scope,
          lifecycle_state: row.lifecycle_state,
          priority,
          ttl: row.ttl,
          source_kind: row.source_kind,
          idempotency_key: row.idempotency_key,
          jev_decision_digest: row.jev_decision?.digest || null,
          policy_revision: row.policy_revision,
          image_voxel_refs: row.image_voxel_refs,
          memory_metadata: memoryMetadata,
          generated_at: nowIso(),
          created_at: row.created_at,
          source,
          source_digest: row.source_digest,
          evidence_digest: row.text_hash,
          evidence_refs: row.evidence_refs,
          evidence_hashes: row.evidence_hashes,
          trust_score: effectiveTrust,
          effective_trust: effectiveTrust,
          path: `.sneakoscope/wiki/records/claims/${id}.json`,
          status: 'verified_partial',
          text_hash: row.text_hash,
          text: row.text_redacted,
          claim: {
            text: row.text_redacted,
            source,
            memory_id: row.memory_id,
            disposition: row.disposition,
            scope: row.scope,
            lifecycle_state: row.lifecycle_state,
            ttl: row.ttl,
            image_voxel_refs: row.image_voxel_refs,
            provenance: row.evidence_refs
          }
        }, { redact: true });
      const blocked = sharedRecordBlocker(record, policy);
      const valid = validateSharedRecord(record, policy);
      if (blocked || !valid.ok) {
        rejected.push(`${row.memory_id}:${blocked || valid.issues.join('|')}`);
        continue;
      }
      const file = path.join(root, row.disposition === 'negative_evidence' ? '.sneakoscope/wiki/wrongness' : '.sneakoscope/wiki/records/claims', `${id}.json`);
      const related = row.disposition === 'negative_evidence' ? [{
        file: path.join(root, '.sneakoscope/wiki/avoidance-rules', `jev-${row.memory_id}.json`),
        record: prepareRecord({ schema: 'sks.avoidance-rule-record.v1', id: `jev-${row.memory_id}`,
          generated_at: nowIso(), source: String(record.path), wrongness_id: id, memory_id: row.memory_id,
          path: `.sneakoscope/wiki/avoidance-rules/jev-${row.memory_id}.json`, text_hash: row.text_hash,
          rule: asRecord(asRecord(record as unknown as JsonRecord).wrongness).avoidance_rule }, { redact: true })
      }] : [];
      if (related.some(item => !validateSharedRecord(item.record, policy).ok || sharedRecordBlocker(item.record, policy))) {
        rejected.push(`${row.memory_id}:related_record_invalid`); continue;
      }
      records.push({ row, file, record, related });
    }
    if (rejected.length) return { schema: 'sks.jev-memory-promotion.v1', ok: false, mission_id: missionId, promoted: [], rejected };
    const written: string[] = [];
    const backup = new Map<string, Buffer | null>();
    const remember = async (file: string) => { if (!backup.has(file)) backup.set(file, await fsp.readFile(file).catch(() => null)); };
    try {
      for (const rel of await listSharedFiles(root)) {
        if (/^\.sneakoscope\/wiki\/(records|wrongness|image-voxels|avoidance-rules|summaries|indexes)\//.test(rel) || rel.startsWith('.sneakoscope/wiki/memory-summary.')) await remember(path.join(root, rel));
      }
      for (const item of records.flatMap(item => [{ file: item.file, record: item.record }, ...(item.related || [])])) {
        await ensureConfinedDirectory(root, path.dirname(item.file));
        const inspected = await inspectConfinedPath(root, item.file);
        if (inspected.leafSymlink || inspected.exists && !inspected.stat?.isFile()) throw new Error('memory_canonical_path');
        await remember(item.file);
        await writeJsonAtomic(item.file, item.record);
        written.push(path.relative(root, item.file).split(path.sep).join('/'));
      }
      const indexPaths = [path.join(root, '.sneakoscope/wiki/indexes/project-index.json'), path.join(root, '.sneakoscope/wiki/indexes/wrongness-index.json'), path.join(root, '.sneakoscope/wiki/memory-summary.json'), path.join(root, '.sneakoscope/wiki/memory-summary.md'), path.join(root, '.sneakoscope/missions', missionId, 'jev-memory-intake.json')];
      for (const file of indexPaths) await remember(file);
      const indexes = written.length ? await rebuildSharedIndexesLocked(root) : undefined;
      if (indexes) {
        const summary = await rebuildMemorySummaries(root, { missionId });
        if (!summary?.ok) throw new Error('memory_summary_rebuild_failed');
      }
      await updateJevMemoryIntake(root, missionId, (current) => current.map((row) => records.some((item) => item.row.memory_id === row.memory_id) ? { ...row, promotion_status: 'promoted' as const } : row));
      return { schema: 'sks.jev-memory-promotion.v1', ok: true, mission_id: missionId, promoted: written, rejected: [], ...(indexes ? { indexes } : {}) };
    } catch (error) {
      const existing = await listSharedFiles(root).catch(() => []);
      for (const rel of existing) {
        if (!/^\.sneakoscope\/wiki\/(records|wrongness|image-voxels|avoidance-rules|summaries|indexes)\//.test(rel) && !rel.startsWith('.sneakoscope/wiki/memory-summary.')) continue;
        const file = path.join(root, rel);
        if (!backup.has(file)) await fsp.rm(file, { force: true }).catch(() => null);
      }
      for (const [file, before] of backup) {
        if (before === null) await fsp.rm(file, { force: true }).catch(() => null);
        else await ensureConfinedDirectory(root, path.dirname(file)).then(() => writeTextAtomic(file, before.toString('utf8'))).catch(() => null);
      }
      return { schema: 'sks.jev-memory-promotion.v1', ok: false, mission_id: missionId, promoted: [], rejected: [`promotion_rolled_back:${error instanceof Error ? error.message : String(error)}`] };
    }
  });
}

export async function writeJevMemoryTombstone(root: string, input: {
  memoryId: string;
  reason?: 'explicit_forget' | 'policy_quarantine';
  previousDigest: string;
}) {
  const tombstone = {
    schema: 'sks.memory-tombstone.v1' as const,
    id: input.memoryId,
    memory_id: input.memoryId,
    reason: input.reason || 'explicit_forget',
    previous_digest: input.previousDigest,
    created_at: nowIso()
  };
  const validation = validateMemoryTombstone(tombstone);
  if (!validation.ok) throw new Error(`memory_tombstone_invalid:${validation.errors.join(',')}`);
  return withTriWikiStateLock(root, async () => {
    const candidates = (await listSharedFiles(root)).filter((file) => /\.sneakoscope\/wiki\/(records|wrongness|image-voxels|avoidance-rules)\/.+\.json$/.test(file));
    let found = false;
    let digestMatches = false;
    for (const rel of candidates) {
      const absolute = path.join(root, rel);
      const row = await readJson<JsonRecord | null>(absolute, null).catch(() => null);
      if (String(row?.memory_id || '') !== input.memoryId) continue;
      found = true;
      const bytes = await fsp.readFile(absolute).catch(() => null);
      if (bytes && sha256(bytes) === input.previousDigest) digestMatches = true;
    }
    if (!found) throw new Error('memory_tombstone_target_missing');
    if (!digestMatches) throw new Error('memory_tombstone_previous_digest_mismatch');
    const dir = path.join(root, '.sneakoscope', 'wiki', 'summaries', 'memory-tombstones');
    await ensureConfinedDirectory(root, dir);
    const file = path.join(dir, `${input.memoryId}.json`);
    const inspected = await inspectConfinedPath(root, file);
    if (inspected.leafSymlink || inspected.exists && !inspected.stat?.isFile()) throw new Error('memory_tombstone_path');
    if (inspected.exists) {
      const prior = await readJson<any>(file);
      if (!validateMemoryTombstone(prior).ok) throw new Error('memory_tombstone_invalid');
      if (prior.previous_digest === input.previousDigest && prior.reason === tombstone.reason) return { ...prior, path: path.relative(root, file).split(path.sep).join('/') };
    }
    await writeJsonAtomic(file, tombstone);
    return { ...tombstone, path: path.relative(root, file).split(path.sep).join('/') };
  });
}

async function validatePromotionEvidence(root: string, missionId: string, row: JevMemoryIntake): Promise<string | null> {
  if (!['visual_evidence', 'negative_evidence'].includes(row.disposition)) return null;
  for (const ref of row.evidence_refs) {
    const inspected = await inspectConfinedPath(root, path.join(root, ref)).catch(() => null);
    if (!inspected?.exists || inspected.leafSymlink || !inspected.stat?.isFile()) return 'evidence_missing';
  }
  if (row.disposition === 'negative_evidence') {
    let failureEvidence = false;
    for (const ref of row.evidence_refs) {
      const raw = await fsp.readFile(path.join(root, ref), 'utf8').catch(() => '');
      const parsed = (() => { try { return JSON.parse(raw); } catch { return null; } })();
      const wrongness = parsed && validateWrongnessRecord(parsed).ok;
      const failedValidation = parsed && typeof parsed.schema === 'string' && /(?:validation|regression|test|gate|proof)/.test(parsed.schema)
        && parsed.ok === false && (Array.isArray(parsed.issues) && parsed.issues.length > 0 || Array.isArray(parsed.blockers) && parsed.blockers.length > 0)
        && parsed.execution_class !== 'mock_fixture' && parsed.execution_class !== 'static_contract' && parsed.mock !== true && parsed.synthetic !== true;
      if (wrongness || failedValidation) failureEvidence = true;
    }
    if (!failureEvidence) return 'negative_failure_evidence_required';
  }
  if (!row.image_voxel_refs.length) return row.disposition === 'visual_evidence' ? 'image_evidence_required' : null;
  const ledger = await readImageVoxelLedger(root, missionImageLedgerPath(root, missionId));
  const validation = await validateImageVoxelLedgerFiles(root, ledger);
  if (!validation.ok) return 'image_ledger_invalid';
  const images = new Map((ledger.images || []).map((image: any) => [String(image.id), image]));
  const anchors = new Map((ledger.anchors || []).map((anchor: any) => [String(anchor.id), anchor]));
  const relations = new Set((ledger.relations || []).map((relation: any) => String(relation.id || '')));
  for (const ref of row.image_voxel_refs) {
    const image = images.get(ref.image_id) as any;
    const anchor = anchors.get(ref.anchor_id) as any;
    if (!image || !anchor || image.sha256 !== ref.sha256 || Number(image.width) !== ref.width || Number(image.height) !== ref.height) return 'image_reference_mismatch';
    if (row.disposition === 'visual_evidence' && anchor.claim_id !== row.memory_id) return 'image_claim_backlink_required';
    if (/\b(?:mock|fixture|synthetic)\b/i.test(String(image.source || ''))) return 'image_non_production_evidence';
    if (JSON.stringify(anchor.bbox) !== JSON.stringify(ref.bbox)) return 'image_bbox_mismatch';
    if (ref.relation_id && !relations.has(ref.relation_id)) return 'image_relation_missing';
    const relation = (ledger.relations || []).find((candidate: any) => String(candidate.id || '') === ref.relation_id) as any;
    if (relation && (String(relation.image_id || relation.image_asset_id || '') !== ref.image_id
      && String(relation.source_image_id || relation.before_image_id || relation.after_image_id || '') !== ref.image_id)) return 'image_relation_mismatch';
    if (relation && Array.isArray(relation.changed_anchor_ids) && !relation.changed_anchor_ids.map(String).includes(ref.anchor_id)) return 'image_relation_anchor_mismatch';
  }
  return null;
}

async function publishSharedMemoryLocked(root: string, opts: SharedPublishOptions): Promise<SharedPublishResult> {
  const target = opts.target || 'all';
  const policy = await ensureGitPolicy(root, { write: true });
  const written: string[] = [];
  const skipped: string[] = [];
  const blockers: string[] = [];
  if (target === 'wiki' || target === 'all') {
    const wiki = await publishWikiClaims(root, policy, opts);
    written.push(...wiki.written);
    skipped.push(...wiki.skipped);
    blockers.push(...wiki.blockers);
    const voxels = await publishImageVoxels(root, policy, opts);
    written.push(...voxels.written);
    skipped.push(...voxels.skipped);
    blockers.push(...voxels.blockers);
  }
  if (target === 'wrongness' || target === 'all') {
    const wrongness = await publishWrongness(root, policy, opts);
    written.push(...wrongness.written);
    skipped.push(...wrongness.skipped);
    blockers.push(...wrongness.blockers);
  }
  const indexes = blockers.length ? undefined : await rebuildSharedIndexesLocked(root);
  if (indexes) await rebuildMemorySummaries(root).catch(() => null);
  return {
    schema: 'sks.shared-memory-publish.v1',
    ok: blockers.length === 0,
    target,
    written: [...new Set(written)].sort(),
    skipped: [...new Set(skipped)].sort(),
    blockers: [...new Set(blockers)].sort(),
    ...(indexes ? { indexes } : {})
  };
}

export async function rebuildSharedIndexes(root: string): Promise<SharedIndexResult> {
  return withTriWikiStateLock(root, () => rebuildSharedIndexesLocked(root));
}

async function rebuildSharedIndexesLocked(root: string): Promise<SharedIndexResult> {
  await ensureSharedMemoryDirs(root);
  const files = await listSharedFiles(root);
  const claims: JsonRecord[] = [];
  const wrongness: JsonRecord[] = [];
  const voxels: JsonRecord[] = [];
  const avoidance: JsonRecord[] = [];
  for (const relPath of files.filter((file) => file.endsWith('.json'))) {
    const row = await readJson<JsonRecord | null>(path.join(root, relPath), null);
    if (!row || typeof row !== 'object') continue;
    if (row.schema === 'sks.triwiki-claim-record.v1') claims.push(row);
    if (row.schema === 'sks.triwiki-wrongness-record.v1') wrongness.push(row);
    if (row.schema === 'sks.image-voxel-record.v1') voxels.push(row);
    if (row.schema === 'sks.avoidance-rule-record.v1') avoidance.push(row);
  }
  const generatedAt = nowIso();
  const projectIndex = {
    schema: 'sks.shared-memory-project-index.v1',
    generated_at: generatedAt,
    claims: claims.map((record) => ({
      id: record.id,
      status: record.status,
      source: record.source,
      text_hash: record.text_hash,
      path: record.path
    })).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    image_voxels: voxels.map((record) => ({
      id: record.id,
      image_asset_id: record.image_asset_id,
      anchor_id: record.anchor_id,
      path: record.path
    })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  };
  const wrongnessIndex = {
    schema: 'sks.shared-wrongness-index.v1',
    generated_at: generatedAt,
    wrongness: wrongness.map((record) => {
      const source = asRecord(record.wrongness);
      return {
        id: record.id,
        status: source.status,
        severity: source.severity,
        wrongness_kind: source.wrongness_kind,
        mission_id: source.mission_id,
        route: source.route,
        avoidance_rule_id: record.avoidance_rule_id
      };
    }).sort((a, b) => String(a.id).localeCompare(String(b.id))),
    avoidance_rules: avoidance.map((record) => ({
      id: record.id,
      wrongness_id: record.wrongness_id,
      text_hash: record.text_hash
    })).sort((a, b) => String(a.id).localeCompare(String(b.id)))
  };
  const projectPath = '.sneakoscope/wiki/indexes/project-index.json';
  const wrongnessPath = '.sneakoscope/wiki/indexes/wrongness-index.json';
  await writeJsonAtomic(path.join(root, projectPath), projectIndex);
  await writeJsonAtomic(path.join(root, wrongnessPath), wrongnessIndex);
  return {
    schema: 'sks.shared-memory-index.v1',
    ok: true,
    indexes: [projectPath, wrongnessPath],
    claims: claims.length,
    wrongness: wrongness.length,
    image_voxels: voxels.length,
    avoidance_rules: avoidance.length
  };
}

export async function validateSharedMemory(root: string): Promise<{ schema: 'sks.shared-memory-validation.v1'; ok: boolean; checked: number; issues: string[]; files: string[] }> {
  const policy = await readGitPolicy(root);
  const issues: string[] = [];
  const files = await listSharedFiles(root);
  const policyValidation = validateGitPolicy(await readJson(path.join(root, '.sneakoscope', 'git-policy.json'), null));
  const manifestValidation = validateSharedMemoryManifest(await readJson(path.join(root, '.sneakoscope', 'shared-memory-manifest.json'), null));
  for (const issue of policyValidation.issues) issues.push(`git-policy:${issue}`);
  for (const issue of manifestValidation.issues) issues.push(`shared-memory-manifest:${issue}`);
  let checked = policyValidation.checked + manifestValidation.checked;
  for (const relPath of files.filter((file) => file.endsWith('.json'))) {
    if (relPath.endsWith('git-policy.json') || relPath.endsWith('shared-memory-manifest.json')) continue;
    checked += 1;
    const validation = await validateSharedRecordFile(path.join(root, relPath), policy);
    if (!validation.ok) issues.push(`${relPath}:${validation.issues.join('|')}`);
    const text = await fsp.readFile(path.join(root, relPath), 'utf8').catch(() => '');
    if (sharedRecordHasSecret(text)) issues.push(`${relPath}:secret`);
  }
  return {
    schema: 'sks.shared-memory-validation.v1',
    ok: issues.length === 0,
    checked,
    issues: [...new Set(issues)].sort(),
    files
  };
}

export async function publishPlan(root: string): Promise<JsonRecord> {
  const policy = await ensureGitPolicy(root, { write: true });
  const files = await listSharedFiles(root);
  return {
    schema: 'sks.git-publish-plan.v1',
    generated_at: nowIso(),
    mode: policy.mode,
    shared_memory_track: policy.shared_memory.track,
    generated_indexes_ignored: policy.shared_memory.generated_ignore,
    local_runtime_ignored: policy.local_runtime.ignore,
    current_shared_files: files,
    commands: [
      'sks git doctor --fix',
      'sks wiki publish latest --shared',
      'sks wrongness publish latest --shared',
      'sks wiki rebuild-index --json',
      'sks wiki validate-shared --json',
      'sks git precommit --json'
    ]
  };
}

export async function sharedMemorySummary(root: string): Promise<JsonRecord> {
  const validation = await validateSharedMemory(root);
  const indexes = await rebuildSharedIndexes(root);
  return {
    schema: 'sks.shared-memory-summary.v1',
    generated_at: nowIso(),
    ok: validation.ok && indexes.ok,
    files: validation.files.length,
    validation,
    indexes
  };
}

async function publishWikiClaims(root: string, policy: SksGitPolicy, opts: SharedPublishOptions): Promise<Pick<SharedPublishResult, 'written' | 'skipped' | 'blockers'>> {
  const packPath = path.join(root, '.sneakoscope', 'wiki', 'context-pack.json');
  if (!(await exists(packPath))) return { written: [], skipped: [], blockers: ['context_pack_missing'] };
  const pack = await readJson<JsonRecord>(packPath);
  const claims = Array.isArray(pack.claims) ? pack.claims : [];
  const written: string[] = [];
  const skipped: string[] = [];
  const blockers: string[] = [];
  for (const raw of claims) {
    const claim = asRecord(raw);
    const id = stableId('claim', claim.id || claim.text || JSON.stringify(claim));
    const record = prepareRecord({
      schema: 'sks.triwiki-claim-record.v1',
      id,
      generated_at: nowIso(),
      source: '.sneakoscope/wiki/context-pack.json',
      path: `.sneakoscope/wiki/records/claims/${id}.json`,
      status: String(claim.status || 'verified_partial'),
      text_hash: sha256(String(claim.text || JSON.stringify(claim))),
      claim
    }, opts);
    const blocked = sharedRecordBlocker(record, policy);
    if (blocked) {
      skipped.push(id);
      blockers.push(`${id}:${blocked}`);
      continue;
    }
    const relPath = `.sneakoscope/wiki/records/claims/${id}.json`;
    await writeJsonAtomic(path.join(root, relPath), record);
    written.push(relPath);
  }
  return { written, skipped, blockers };
}

async function publishWrongness(root: string, policy: SksGitPolicy, opts: SharedPublishOptions): Promise<Pick<SharedPublishResult, 'written' | 'skipped' | 'blockers'>> {
  const ledgers = [await readWrongnessLedger(root, null)];
  const latestMission = await latestMissionId(root);
  if (latestMission) ledgers.push(await readWrongnessLedger(root, latestMission));
  const records = dedupeWrongness(ledgers.flatMap((ledger) => ledger.records || []));
  const written: string[] = [];
  const skipped: string[] = [];
  const blockers: string[] = [];
  for (const record of records) {
    const id = stableId('wrongness', record.id);
    const wrapper = prepareRecord({
      schema: 'sks.triwiki-wrongness-record.v1',
      id,
      generated_at: nowIso(),
      source: record.mission_id ? `.sneakoscope/missions/${record.mission_id}/wrongness-ledger.json` : '.sneakoscope/wiki/wrongness-ledger.json',
      path: `.sneakoscope/wiki/wrongness/${id}.json`,
      avoidance_rule_id: record.avoidance_rule.id || stableId('avoid', `${record.id}:${record.avoidance_rule.text}`),
      wrongness: record
    }, opts);
    const blocked = sharedRecordBlocker(wrapper, policy);
    if (blocked) {
      skipped.push(id);
      blockers.push(`${id}:${blocked}`);
      continue;
    }
    const relPath = `.sneakoscope/wiki/wrongness/${id}.json`;
    await writeJsonAtomic(path.join(root, relPath), wrapper);
    written.push(relPath);
    const ruleId = stableId('avoid', record.avoidance_rule.id || `${record.id}:${record.avoidance_rule.text}`);
    const ruleRecord = prepareRecord({
      schema: 'sks.avoidance-rule-record.v1',
      id: ruleId,
      generated_at: nowIso(),
      source: relPath,
      path: `.sneakoscope/wiki/avoidance-rules/${ruleId}.json`,
      wrongness_id: id,
      text_hash: sha256(record.avoidance_rule.text || record.id),
      rule: record.avoidance_rule
    }, opts);
    const ruleBlocked = sharedRecordBlocker(ruleRecord, policy);
    if (ruleBlocked) {
      skipped.push(ruleId);
      blockers.push(`${ruleId}:${ruleBlocked}`);
      continue;
    }
    const rulePath = `.sneakoscope/wiki/avoidance-rules/${ruleId}.json`;
    await writeJsonAtomic(path.join(root, rulePath), ruleRecord);
    written.push(rulePath);
  }
  return { written, skipped, blockers };
}

async function publishImageVoxels(root: string, policy: SksGitPolicy, opts: SharedPublishOptions): Promise<Pick<SharedPublishResult, 'written' | 'skipped' | 'blockers'>> {
  const ledgerPath = path.join(root, '.sneakoscope', 'wiki', 'image-voxel-ledger.json');
  if (!(await exists(ledgerPath))) return { written: [], skipped: ['image_voxel_ledger_missing'], blockers: [] };
  const ledger = await readImageVoxelLedger(root, ledgerPath);
  const images = Array.isArray(ledger.images) ? ledger.images : [];
  const anchors = Array.isArray(ledger.anchors) ? ledger.anchors : [];
  const imagesById = new Map<string, JsonRecord>(images.map((image: unknown) => {
    const row = asRecord(image);
    return [String(row.id || ''), row];
  }));
  const written: string[] = [];
  const skipped: string[] = [];
  const blockers: string[] = [];
  for (const anchor of anchors.map(asRecord)) {
    const imageId = String(anchor.image_id || anchor.imageId || '');
    const image = imagesById.get(imageId);
    if (!image) {
      skipped.push(String(anchor.id || 'unknown-anchor'));
      blockers.push(`${anchor.id || 'unknown-anchor'}:missing_image`);
      continue;
    }
    const anchorId = stableId('anchor', anchor.id || `${imageId}:${JSON.stringify(anchor.bbox || [])}`);
    const assetId = stableId('image', imageId);
    const id = `${assetId}-${anchorId}`;
    const record = prepareRecord({
      schema: 'sks.image-voxel-record.v1',
      id,
      generated_at: nowIso(),
      source: '.sneakoscope/wiki/image-voxel-ledger.json',
      path: `.sneakoscope/wiki/image-voxels/${assetId}/${anchorId}.json`,
      image_asset_id: assetId,
      source_image_id: imageId,
      anchor_id: anchorId,
      image,
      anchor
    }, opts);
    const blocked = sharedRecordBlocker(record, policy);
    if (blocked) {
      skipped.push(id);
      blockers.push(`${id}:${blocked}`);
      continue;
    }
    const relPath = `.sneakoscope/wiki/image-voxels/${assetId}/${anchorId}.json`;
    await writeJsonAtomic(path.join(root, relPath), record);
    written.push(relPath);
  }
  return { written, skipped, blockers };
}

function prepareRecord<T>(record: T, opts: SharedPublishOptions): T {
  return opts.redact ? redactSharedRecord(record) : record;
}

function sharedRecordBlocker(record: unknown, policy: SksGitPolicy): string | null {
  if (policy.security.block_secret_patterns && sharedRecordHasSecret(record)) return 'secret';
  if (policy.security.block_mock_real_confusion && isMockPositiveSharedClaim(record)) return 'mock_positive_claim';
  return null;
}

function stableId(prefix: string, value: unknown): string {
  const raw = String(value || prefix);
  const slug = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72);
  return slug || `${prefix}-${sha256(raw).slice(0, 12)}`;
}

function dedupeWrongness(records: readonly WrongnessRecord[]): WrongnessRecord[] {
  const byId = new Map<string, WrongnessRecord>();
  for (const record of records) byId.set(record.id, record);
  return Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id));
}

async function latestMissionId(root: string): Promise<string | null> {
  const dir = path.join(root, '.sneakoscope', 'missions');
  let entries: string[] = [];
  try {
    entries = await fsp.readdir(dir);
  } catch {
    return null;
  }
  return entries.filter((name) => name.startsWith('M-')).sort().at(-1) || null;
}

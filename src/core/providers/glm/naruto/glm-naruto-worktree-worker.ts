import { createPatchEnvelope } from './glm-naruto-patch-envelope.js';
import { sha256 } from '../../../fsx.js';
import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { parseGlmNarutoPatchCandidate } from './glm-naruto-patch-candidate-parser.js';
import {
  applyPatchInWorktree,
  createGlmNarutoWorkerWorktree,
  diffWorktree,
  type GlmNarutoWorktreeLease
} from './glm-naruto-worktree-manager.js';
import { cleanupGlmNarutoWorktree } from './glm-naruto-worktree-cleanup.js';

export interface GlmNarutoWorktreeWorkerResult {
  readonly ok: boolean;
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly lease?: GlmNarutoWorktreeLease;
  readonly blockers: readonly string[];
  readonly worktree?: {
    readonly candidate_body_sha256: string;
    readonly extracted_patch_sha256: string | null;
    readonly applied_patch_was_extracted: boolean;
  };
}

export async function materializePatchViaWorktree(input: {
  readonly repoRoot: string;
  readonly missionId: string;
  readonly envelope: GlmNarutoPatchEnvelope;
  readonly baseCommit?: string | null;
  readonly cleanup: boolean;
}): Promise<GlmNarutoWorktreeWorkerResult> {
  let lease: GlmNarutoWorktreeLease | undefined;
  try {
    lease = await createGlmNarutoWorkerWorktree({
      repoRoot: input.repoRoot,
      missionId: input.missionId,
      workerId: input.envelope.worker_id,
      ...(input.baseCommit !== undefined ? { baseCommit: input.baseCommit } : {})
    });
    const parsed = parseGlmNarutoPatchCandidate(input.envelope.patch);
    const parseProof = {
      candidate_body_sha256: sha256(input.envelope.patch),
      extracted_patch_sha256: parsed.ok ? sha256(parsed.patch) : null,
      applied_patch_was_extracted: false
    };
    if (!parsed.ok) {
      await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
      return {
        ok: false,
        envelope: { ...input.envelope, status: 'gate_failed', blockers: parsed.blockers },
        lease,
        blockers: parsed.blockers,
        worktree: parseProof
      };
    }
    const applied = await applyPatchInWorktree(lease.path, parsed.patch);
    if (!applied.ok) {
      await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
      return {
        ok: false,
        envelope: { ...input.envelope, status: 'gate_failed', blockers: ['worktree_patch_apply_failed'] },
        lease,
        blockers: ['worktree_patch_apply_failed'],
        worktree: { ...parseProof, applied_patch_was_extracted: true }
      };
    }
    const diff = await diffWorktree(lease.path);
    const envelope = createPatchEnvelope({
      missionId: input.envelope.mission_id,
      workerId: input.envelope.worker_id,
      shardId: input.envelope.shard_id,
      baseDigest: input.envelope.base_digest,
      patch: diff || parsed.patch,
      strategy: input.envelope.strategy,
      reasoningEffort: input.envelope.reasoning_effort,
      status: input.envelope.status,
      warnings: [...input.envelope.warnings, `worktree:${lease.path}`]
    });
    await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
    return {
      ok: true,
      envelope,
      lease,
      blockers: [],
      worktree: { ...parseProof, applied_patch_was_extracted: true }
    };
  } catch (err) {
    if (lease) await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
    return {
      ok: false,
      envelope: { ...input.envelope, status: 'gate_failed', blockers: ['glm_naruto_worktree_not_implemented_or_unavailable'] },
      ...(lease ? { lease } : {}),
      blockers: ['glm_naruto_worktree_not_implemented_or_unavailable', err instanceof Error ? err.message : String(err)]
    };
  }
}

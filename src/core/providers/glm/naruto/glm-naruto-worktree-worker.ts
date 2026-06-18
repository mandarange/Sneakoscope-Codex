import { createPatchEnvelope } from './glm-naruto-patch-envelope.js';
import type { GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
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
    const applied = await applyPatchInWorktree(lease.path, input.envelope.patch);
    if (!applied.ok) {
      await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
      return { ok: false, envelope: { ...input.envelope, status: 'gate_failed', blockers: ['worktree_patch_apply_failed'] }, lease, blockers: ['worktree_patch_apply_failed'] };
    }
    const diff = await diffWorktree(lease.path);
    const envelope = createPatchEnvelope({
      missionId: input.envelope.mission_id,
      workerId: input.envelope.worker_id,
      shardId: input.envelope.shard_id,
      baseDigest: input.envelope.base_digest,
      patch: diff,
      strategy: input.envelope.strategy,
      reasoningEffort: input.envelope.reasoning_effort,
      status: input.envelope.status,
      warnings: [...input.envelope.warnings, `worktree:${lease.path}`]
    });
    await cleanupGlmNarutoWorktree({ repoRoot: input.repoRoot, missionId: input.missionId, lease, cleanup: input.cleanup });
    return { ok: true, envelope, lease, blockers: [] };
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

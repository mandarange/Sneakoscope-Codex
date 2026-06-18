import { nowIso, writeJsonAtomic } from '../../../fsx.js';
import path from 'node:path';
import type { GlmNarutoWorktreeLease } from './glm-naruto-worktree-manager.js';
import { removeGlmNarutoWorkerWorktree } from './glm-naruto-worktree-manager.js';

export interface GlmNarutoWorktreeCleanupRecord {
  readonly schema: 'sks.glm-naruto-worktree-cleanup.v1';
  readonly worker_id: string;
  readonly worktree_path: string;
  readonly cleanup_requested: boolean;
  readonly removed: boolean;
  readonly error: string | null;
  readonly created_at: string;
}

export async function cleanupGlmNarutoWorktree(input: {
  readonly repoRoot: string;
  readonly missionId: string;
  readonly lease: GlmNarutoWorktreeLease;
  readonly cleanup: boolean;
}): Promise<GlmNarutoWorktreeCleanupRecord> {
  const result = input.cleanup
    ? await removeGlmNarutoWorkerWorktree(input.repoRoot, input.lease)
    : { ok: false, error: null };
  const record: GlmNarutoWorktreeCleanupRecord = {
    schema: 'sks.glm-naruto-worktree-cleanup.v1',
    worker_id: input.lease.worker_id,
    worktree_path: input.lease.path,
    cleanup_requested: input.cleanup,
    removed: input.cleanup ? result.ok : false,
    error: input.cleanup ? result.error ?? null : null,
    created_at: nowIso()
  };
  await writeJsonAtomic(
    path.join(input.repoRoot, '.sneakoscope', 'glm-naruto', input.missionId, 'workers', input.lease.worker_id, 'worktree-cleanup.json'),
    record
  ).catch(() => undefined);
  return record;
}

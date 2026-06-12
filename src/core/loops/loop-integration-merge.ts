import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { runGitCommand } from '../git/git-worktree-runner.js';
import { guardedWriteFile, guardContextForRoute } from '../safety/mutation-guard.js';
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js';
import type { SksLoopPlan, SksLoopProof } from './loop-schema.js';
import { loopIntegrationMergePath } from './loop-artifacts.js';

export interface LoopIntegrationMergeResult {
  schema: 'sks.loop-integration-merge.v1';
  ok: boolean;
  applied_loops: string[];
  conflict_loops: string[];
  changed_files: string[];
  blockers: string[];
}

export async function mergeLoopWorktrees(input: {
  root: string;
  plan: SksLoopPlan;
  proofs: SksLoopProof[];
}): Promise<LoopIntegrationMergeResult> {
  const completed = input.proofs.filter((proof) => proof.status === 'completed' && proof.loop_id !== input.plan.integration_loop_id);
  const blockers: string[] = [];
  const appliedLoops: string[] = [];
  const conflictLoops = new Set<string>();
  const changedFiles = new Set<string>();
  const owners = new Map<string, string>();

  for (const proof of completed) {
    for (const file of proof.changed_files) {
      const previous = owners.get(file);
      if (previous && previous !== proof.loop_id) {
        blockers.push(`loop_integration_file_conflict:${file}:${previous}:${proof.loop_id}`);
        conflictLoops.add(previous);
        conflictLoops.add(proof.loop_id);
      } else {
        owners.set(file, proof.loop_id);
      }
    }
  }

  if (!blockers.length) {
    for (const proof of completed) {
      const worktreePath = proof.worktree.path;
      if (!worktreePath) continue;
      const diff = await runGitCommand(worktreePath, ['diff', '--binary', '--full-index', 'HEAD'], { timeoutMs: 60000 }).catch(() => null);
      if (!diff?.ok) {
        blockers.push(`loop_integration_diff_failed:${proof.loop_id}`);
        conflictLoops.add(proof.loop_id);
        continue;
      }
      if (!diff.stdout.trim()) continue;
      const apply = await runGitCommand(input.root, ['apply', '--whitespace=nowarn', '-'], { input: diff.stdout, timeoutMs: 60000 }).catch(() => null);
      if (!apply?.ok) {
        blockers.push(`loop_integration_apply_conflict:${proof.loop_id}`);
        conflictLoops.add(proof.loop_id);
        await writeHandoff(input.root, proof.loop_id, apply?.stderr_tail || apply?.stdout_tail || 'git apply failed');
        continue;
      }
      appliedLoops.push(proof.loop_id);
      for (const file of proof.changed_files) changedFiles.add(file);
    }
  }

  const result: LoopIntegrationMergeResult = {
    schema: 'sks.loop-integration-merge.v1',
    ok: blockers.length === 0,
    applied_loops: appliedLoops,
    conflict_loops: [...conflictLoops],
    changed_files: [...changedFiles],
    blockers: [...new Set(blockers)]
  };
  await writeJsonAtomic(loopIntegrationMergePath(input.root, input.plan.mission_id), { ...result, generated_at: nowIso() });
  return result;
}

async function writeHandoff(root: string, loopId: string, detail: string): Promise<void> {
  const contract = createRequestedScopeContract({
    route: '$Loop',
    userRequest: 'Write loop integration conflict handoff inside project .sneakoscope.',
    projectRoot: root
  });
  const handoffPath = path.join(root, '.sneakoscope', `loop-integration-conflict-${safeArtifactId(loopId)}.txt`);
  await guardedWriteFile(guardContextForRoute(root, contract, 'loop integration conflict handoff'), handoffPath, detail).catch(() => undefined);
}

function safeArtifactId(value: string): string {
  return String(value || 'unknown').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80) || 'unknown';
}

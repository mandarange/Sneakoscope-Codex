import path from 'node:path';
import { nowIso, writeJsonAtomic } from '../fsx.js';
import { guardedWriteFile, guardContextForRoute } from '../safety/mutation-guard.js';
import { createRequestedScopeContract } from '../safety/requested-scope-contract.js';
import type { SksLoopPlan, SksLoopProof } from './loop-schema.js';
import { loopIntegrationMergePath } from './loop-artifacts.js';
import { mergeSingleLoopWorktree, type LoopMergeStrategyResult } from './loop-merge-strategy.js';

export interface LoopIntegrationMergeResult {
  schema: 'sks.loop-integration-merge.v1';
  ok: boolean;
  applied_loops: string[];
  conflict_loops: string[];
  changed_files: string[];
  blockers: string[];
  merge_attempts?: Record<string, LoopMergeStrategyResult>;
  strategy_summary?: {
    apply_count: number;
    apply_3way_count: number;
    cherry_pick_count: number;
    merge_no_commit_count: number;
    handoff_count: number;
  };
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
  const mergeAttempts: Record<string, LoopMergeStrategyResult> = {};

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
      const merge = await mergeSingleLoopWorktree({ root: input.root, proof, worktreePath, allowBranchMerge: true });
      mergeAttempts[proof.loop_id] = merge;
      if (!merge.ok) {
        blockers.push(...merge.blockers, `loop_integration_merge_conflict:${proof.loop_id}`);
        conflictLoops.add(proof.loop_id);
        await writeHandoff(input.root, proof.loop_id, merge.blockers.join('\n') || 'loop merge strategy failed');
        continue;
      }
      appliedLoops.push(proof.loop_id);
      for (const file of merge.changed_files) changedFiles.add(file);
    }
  }

  const result: LoopIntegrationMergeResult = {
    schema: 'sks.loop-integration-merge.v1',
    ok: blockers.length === 0,
    applied_loops: appliedLoops,
    conflict_loops: [...conflictLoops],
    changed_files: [...changedFiles],
    blockers: [...new Set(blockers)],
    merge_attempts: mergeAttempts,
    strategy_summary: summarizeStrategies(Object.values(mergeAttempts))
  };
  await writeJsonAtomic(loopIntegrationMergePath(input.root, input.plan.mission_id), { ...result, generated_at: nowIso() });
  return result;
}

function summarizeStrategies(results: LoopMergeStrategyResult[]): NonNullable<LoopIntegrationMergeResult['strategy_summary']> {
  return {
    apply_count: results.filter((row) => row.selected_strategy === 'apply').length,
    apply_3way_count: results.filter((row) => row.selected_strategy === 'apply-3way').length,
    cherry_pick_count: results.filter((row) => row.selected_strategy === 'cherry-pick').length,
    merge_no_commit_count: results.filter((row) => row.selected_strategy === 'merge-no-commit').length,
    handoff_count: results.filter((row) => row.selected_strategy === 'handoff' || !row.ok).length
  };
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

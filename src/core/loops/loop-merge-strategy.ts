import path from 'node:path';
import { exists, runProcess } from '../fsx.js';
import { gitBlocker, runGitCommand } from '../git/git-worktree-runner.js';
import type { SksLoopProof } from './loop-schema.js';

export interface LoopMergeAttempt {
  strategy: 'apply-check' | 'apply' | 'apply-3way' | 'cherry-pick' | 'merge-no-commit' | 'handoff';
  ok: boolean;
  exit_code: number | null;
  stdout_tail: string;
  stderr_tail: string;
  duration_ms: number;
  blockers: string[];
}

export interface LoopMergeStrategyResult {
  schema: 'sks.loop-merge-strategy-result.v1';
  loop_id: string;
  ok: boolean;
  selected_strategy: string | null;
  attempts: LoopMergeAttempt[];
  changed_files: string[];
  blockers: string[];
}

export async function mergeSingleLoopWorktree(input: {
  root: string;
  proof: SksLoopProof;
  worktreePath: string;
  allowBranchMerge?: boolean;
}): Promise<LoopMergeStrategyResult> {
  const attempts: LoopMergeAttempt[] = [];
  const changedFiles = [...new Set(input.proof.changed_files)];
  const diff = await runGitCommand(input.worktreePath, ['diff', '--binary', '--full-index', 'HEAD'], { timeoutMs: 60000 }).catch(() => null);
  if (!diff?.ok) {
    return result(input.proof.loop_id, false, null, attempts, changedFiles, [`loop_merge_diff_failed:${input.proof.loop_id}`]);
  }
  if (!diff.stdout.trim()) return result(input.proof.loop_id, true, 'already_applied', attempts, changedFiles, []);

  const applyCheck = await gitAttempt('apply-check', input.root, ['apply', '--check', '--whitespace=nowarn', '-'], diff.stdout);
  attempts.push(applyCheck);
  if (applyCheck.ok) {
    const apply = await gitAttempt('apply', input.root, ['apply', '--whitespace=nowarn', '-'], diff.stdout);
    attempts.push(apply);
    if (apply.ok) return result(input.proof.loop_id, true, 'apply', attempts, changedFiles, []);
    await rollbackApply(input.root, diff.stdout);
  }

  const alreadyApplied = await gitAttempt('apply-check', input.root, ['apply', '--reverse', '--check', '--whitespace=nowarn', '-'], diff.stdout);
  if (alreadyApplied.ok) {
    attempts.push({ ...alreadyApplied, strategy: 'apply-check', blockers: [] });
    return result(input.proof.loop_id, true, 'already_applied', attempts, changedFiles, []);
  }

  const apply3Check = await gitAttempt('apply-3way', input.root, ['apply', '--3way', '--check', '--whitespace=nowarn', '-'], diff.stdout);
  attempts.push(apply3Check);
  if (apply3Check.ok) {
    const apply3 = await gitAttempt('apply-3way', input.root, ['apply', '--3way', '--whitespace=nowarn', '-'], diff.stdout);
    attempts.push(apply3);
    if (apply3.ok) return result(input.proof.loop_id, true, 'apply-3way', attempts, changedFiles, []);
    await abortMergeLikeState(input.root);
  }

  const head = await runGitCommand(input.worktreePath, ['rev-parse', '--verify', 'HEAD'], { timeoutMs: 10000 }).catch(() => null);
  const commit = head?.ok ? head.stdout.trim() : '';
  if (commit) {
    const cherry = await gitAttempt('cherry-pick', input.root, ['cherry-pick', '--no-commit', commit], undefined);
    attempts.push(cherry);
    if (cherry.ok) return result(input.proof.loop_id, true, 'cherry-pick', attempts, changedFiles, []);
    await runGitCommand(input.root, ['cherry-pick', '--abort'], { timeoutMs: 30000 }).catch(() => null);
    await abortMergeLikeState(input.root);
  }

  if (input.allowBranchMerge && input.proof.worktree.branch) {
    const branch = input.proof.worktree.branch;
    const merge = await gitAttempt('merge-no-commit', input.root, ['merge', '--no-ff', '--no-commit', branch], undefined);
    attempts.push(merge);
    if (merge.ok) return result(input.proof.loop_id, true, 'merge-no-commit', attempts, changedFiles, []);
    await runGitCommand(input.root, ['merge', '--abort'], { timeoutMs: 30000 }).catch(() => null);
    await abortMergeLikeState(input.root);
  }

  const handoff: LoopMergeAttempt = {
    strategy: 'handoff',
    ok: false,
    exit_code: null,
    stdout_tail: '',
    stderr_tail: 'all merge strategies failed',
    duration_ms: 1,
    blockers: [`loop_merge_conflict_handoff:${input.proof.loop_id}`]
  };
  attempts.push(handoff);
  return result(input.proof.loop_id, false, 'handoff', attempts, changedFiles, handoff.blockers);
}

async function gitAttempt(strategy: LoopMergeAttempt['strategy'], cwd: string, args: string[], input?: string): Promise<LoopMergeAttempt> {
  const started = Date.now();
  const res = await runGitCommand(cwd, args, { timeoutMs: 60000, ...(input === undefined ? {} : { input }) }).catch((err: unknown) => null);
  if (!res) {
    return { strategy, ok: false, exit_code: null, stdout_tail: '', stderr_tail: '', duration_ms: Math.max(1, Date.now() - started), blockers: [`loop_merge_${strategy}_exception`] };
  }
  return {
    strategy,
    ok: res.ok,
    exit_code: res.code,
    stdout_tail: res.stdout_tail,
    stderr_tail: res.stderr_tail,
    duration_ms: Math.max(1, Date.now() - started),
    blockers: res.ok ? [] : [gitBlocker(`loop_merge_${strategy}_failed`, res)]
  };
}

async function rollbackApply(root: string, diff: string): Promise<void> {
  await runGitCommand(root, ['apply', '--reverse', '--whitespace=nowarn', '-'], { input: diff, timeoutMs: 60000 }).catch(() => null);
  await abortMergeLikeState(root);
}

async function abortMergeLikeState(root: string): Promise<void> {
  if (await exists(path.join(root, '.git', 'MERGE_HEAD'))) await runGitCommand(root, ['merge', '--abort'], { timeoutMs: 30000 }).catch(() => null);
  if (await exists(path.join(root, '.git', 'CHERRY_PICK_HEAD'))) await runGitCommand(root, ['cherry-pick', '--abort'], { timeoutMs: 30000 }).catch(() => null);
  await runProcess('git', ['reset', '--merge'], { cwd: root, timeoutMs: 30000, maxOutputBytes: 64 * 1024 }).catch(() => null);
}

function result(loopId: string, ok: boolean, selectedStrategy: string | null, attempts: LoopMergeAttempt[], changedFiles: string[], blockers: string[]): LoopMergeStrategyResult {
  return {
    schema: 'sks.loop-merge-strategy-result.v1',
    loop_id: loopId,
    ok,
    selected_strategy: selectedStrategy,
    attempts,
    changed_files: changedFiles,
    blockers: [...new Set(blockers)]
  };
}

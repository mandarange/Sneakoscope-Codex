import { flag, readOption, positionalArgs } from '../../../../cli/args.js';
import { printJson } from '../../../../cli/output.js';
import { runGlmNarutoMission } from './glm-naruto-orchestrator.js';
import { runGlmNarutoBench } from './glm-naruto-bench.js';
import type { GlmNarutoMissionResult } from './glm-naruto-types.js';

export async function glmNarutoCommand(args: string[] = []): Promise<GlmNarutoMissionResult | unknown> {
  if (flag(args, '--bench')) {
    const result = await runGlmNarutoBench(process.cwd(), args);
    if (flag(args, '--json')) printJson(result);
    else if (result.status === 'blocked') console.error(`GLM Naruto bench blocked: ${result.warnings.join(', ')}`);
    else console.log(`GLM Naruto bench: ${result.status} workers=${result.summary.simulated_workers} candidates=${result.summary.simulated_patch_candidates}`);
    return result;
  }

  const positional = positionalArgs(args).map(String);
  const task = positional.join(' ').trim();

  if (!task && !flag(args, '--repair') && !flag(args, '--status')) {
    const result = {
      schema: 'sks.glm-naruto-result.v1',
      ok: false,
      status: 'blocked' as const,
      mission_id: 'none',
      task: '',
      model: 'z-ai/glm-5.2',
      gpt_fallback_allowed: false as const,
      termination_reason: 'no_task_provided',
      blockers: ['glm_naruto_no_task'],
      warnings: [] as string[]
    };
    if (flag(args, '--json')) printJson(result);
    else console.error('GLM Naruto requires a task. Usage: sks --mad --glm --naruto "<task>"');
    process.exitCode = 1;
    return result;
  }

  const maxWorkers = parseInt(readOption(args, '--clones', readOption(args, '--workers', '12')), 10) || 12;
  const deep = flag(args, '--deep');
  const useJudge = flag(args, '--judge');
  const xhighFinalizer = flag(args, '--xhigh-finalizer');
  const useWorktree = flag(args, '--worktree');
  const patchEnvelopeOnly = flag(args, '--patch-envelope-only');
  const keepWorktrees = flag(args, '--keep-worktrees');
  const cleanupWorktrees = flag(args, '--cleanup-worktrees') || !keepWorktrees;
  const allowPatchEnvelopeFallback = flag(args, '--allow-patch-envelope-fallback');
  const noApply = flag(args, '--no-apply');
  const skipVerifier = flag(args, '--skip-verifier');
  const allowDirtyApply = flag(args, '--allow-dirty-apply');
  const noRollback = flag(args, '--no-rollback');
  const strictChecks = flag(args, '--strict-checks');
  const mergeStrategy = readOption(args, '--merge-strategy', 'deterministic') as 'deterministic' | 'quorum' | 'judge';

  const result = await runGlmNarutoMission({
    cwd: process.cwd(),
    task,
    args,
    maxWorkers,
    deep,
    useJudge,
    xhighFinalizer,
    useWorktree: useWorktree && !patchEnvelopeOnly,
    patchEnvelopeOnly,
    allowPatchEnvelopeFallback,
    keepWorktrees,
    cleanupWorktrees,
    noApply: noApply || flag(args, '--dry-run'),
    skipVerifier,
    allowDirtyApply,
    noRollback,
    strictChecks,
    mergeStrategy
  });

  if (flag(args, '--json')) {
    printJson(result);
  } else {
    const r = result as GlmNarutoMissionResult;
    if (r.ok) {
      console.log(`GLM Naruto completed: ${r.applied_patches} patches applied, ${r.patch_candidates} candidates, ${r.gate_passed_candidates} gate-passed, ${r.repair_waves} repair waves`);
      if (r.artifact_dir) console.log(`Artifacts: ${r.artifact_dir}`);
    } else {
      console.error(`GLM Naruto ${r.status}: ${r.termination_reason} — blockers: ${r.blockers.join(', ')}`);
      process.exitCode = 1;
    }
  }

  return result;
}

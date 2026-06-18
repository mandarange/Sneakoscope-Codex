import { spawn } from 'node:child_process';
import path from 'node:path';
import { sha256, writeJsonAtomic, writeTextAtomic } from '../../../fsx.js';
import { parseUnifiedDiffPatch } from '../glm-patch-parser.js';
import { combineGlmNarutoPatches } from './glm-naruto-combined-patch.js';
import type { GlmNarutoApplyTransaction, GlmNarutoPatchEnvelope } from './glm-naruto-types.js';
import { runGlmNarutoTargetedChecks } from './glm-naruto-targeted-checks.js';

export async function runGlmNarutoApplyTransaction(input: {
  readonly cwd: string;
  readonly missionId: string;
  readonly envelopes: readonly GlmNarutoPatchEnvelope[];
  readonly selectedPatchIds: readonly string[];
  readonly artifactDir: string;
  readonly allowDirtyApply?: boolean;
  readonly noRollback?: boolean;
  readonly strictChecks?: boolean;
}): Promise<{ readonly ok: boolean; readonly applied: readonly string[]; readonly patch: string; readonly transaction: GlmNarutoApplyTransaction }> {
  const preStatus = await gitText(input.cwd, ['status', '--short']);
  const preDiff = await gitText(input.cwd, ['diff', '--binary']);
  const patch = combineGlmNarutoPatches(input.envelopes, input.selectedPatchIds);
  const parsed = parseUnifiedDiffPatch(patch);
  const dirtyTouchedPaths = await dirtyPaths(input.cwd, parsed.touchedPaths);
  const patchPath = path.join(input.artifactDir, 'selected-combined.patch');
  await writeTextAtomic(patchPath, patch);

  const blockers: string[] = [];
  let applyCheckPassed = false;
  let applyPassed = false;
  let targetedChecksPassed: boolean | null = null;
  let rollbackAttempted = false;
  let rollbackPassed: boolean | null = null;
  let finalStatus: GlmNarutoApplyTransaction['final_status'] = 'blocked';

  if (!patch.trim()) {
    blockers.push('combined_patch_empty');
  } else if (dirtyTouchedPaths.length > 0 && !input.allowDirtyApply) {
    blockers.push(`dirty_touched_paths_before_apply:${dirtyTouchedPaths.join(',')}`);
  } else {
    const checked = await gitApply(input.cwd, patch, ['apply', '--check', '--whitespace=nowarn', '-']);
    applyCheckPassed = checked.code === 0;
    if (!applyCheckPassed) blockers.push(checked.stderr || checked.stdout || 'git_apply_check_failed');
    if (applyCheckPassed) {
      const applied = await gitApply(input.cwd, patch, ['apply', '--whitespace=nowarn', '-']);
      applyPassed = applied.code === 0;
      if (applyPassed) {
        const targeted = await runGlmNarutoTargetedChecks({
          cwd: input.cwd,
          touchedPaths: parsed.touchedPaths,
          artifactDir: input.artifactDir,
          ...(input.strictChecks !== undefined ? { strictChecks: input.strictChecks } : {})
        });
        targetedChecksPassed = targeted.ok;
        if (targeted.ok) {
          finalStatus = 'applied';
        } else {
          blockers.push(...targeted.blockers);
          if (!input.noRollback) {
            rollbackAttempted = true;
            const rollback = await gitApply(input.cwd, patch, ['apply', '-R', '--whitespace=nowarn', '-']);
            rollbackPassed = rollback.code === 0;
            finalStatus = rollbackPassed ? 'rolled_back' : 'blocked';
            if (!rollbackPassed) blockers.push(rollback.stderr || rollback.stdout || 'rollback_reverse_patch_failed');
          } else {
            finalStatus = 'blocked';
          }
        }
      } else {
        blockers.push(applied.stderr || applied.stdout || 'git_apply_failed');
        if (!input.noRollback) {
          rollbackAttempted = true;
          const rollback = await gitApply(input.cwd, patch, ['apply', '-R', '--whitespace=nowarn', '-']);
          rollbackPassed = rollback.code === 0;
          finalStatus = rollbackPassed ? 'rolled_back' : 'blocked';
          if (!rollbackPassed) blockers.push(rollback.stderr || rollback.stdout || 'rollback_reverse_patch_failed');
        }
      }
    }
  }

  const postDiff = await gitText(input.cwd, ['diff', '--binary']);
  const transaction: GlmNarutoApplyTransaction = {
    schema: 'sks.glm-naruto-apply-transaction.v1',
    mission_id: input.missionId,
    selected_patch_ids: input.selectedPatchIds,
    touched_paths: parsed.touchedPaths,
    dirty_touched_paths_before_apply: dirtyTouchedPaths,
    dirty_policy: input.allowDirtyApply ? 'allow' : 'block',
    pre_status: preStatus,
    pre_diff_sha256: sha256(preDiff),
    post_diff_sha256: sha256(postDiff),
    combined_patch_sha256: sha256(patch),
    apply_check_passed: applyCheckPassed,
    apply_passed: applyPassed,
    targeted_checks_passed: targetedChecksPassed,
    rollback_attempted: rollbackAttempted,
    rollback_passed: rollbackPassed,
    final_status: finalStatus,
    blockers
  };
  await writeJsonAtomic(path.join(input.artifactDir, 'apply-transaction.json'), transaction);
  await writeJsonAtomic(path.join(input.artifactDir, 'apply-transaction-diff-hashes.json'), {
    schema: 'sks.glm-naruto-apply-transaction-diff-hashes.v1',
    mission_id: input.missionId,
    pre_diff_sha256: sha256(preDiff),
    post_diff_sha256: sha256(postDiff),
    combined_patch_sha256: sha256(patch)
  });
  return { ok: finalStatus === 'applied', applied: finalStatus === 'applied' ? input.selectedPatchIds : [], patch, transaction };
}

function gitText(cwd: string, args: readonly string[]): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.on('close', () => resolve(stdout));
  });
}

async function dirtyPaths(cwd: string, paths: readonly string[]): Promise<readonly string[]> {
  if (paths.length === 0) return [];
  const status = await gitText(cwd, ['status', '--short', '--', ...paths]);
  return status.split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const raw = line.slice(3).trim();
      return raw.includes(' -> ') ? raw.split(' -> ').pop()!.trim() : raw;
    });
}

function gitApply(cwd: string, patch: string, args: readonly string[]): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(patch);
  });
}

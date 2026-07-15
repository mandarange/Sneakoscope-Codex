import { spawn } from 'node:child_process';
import type { SksResult } from '../../results.js';
import { parseUnifiedDiffPatch } from './glm-patch-parser.js';

export interface GlmPatchApplyResult {
  readonly checked: boolean;
  readonly applied: boolean;
  readonly touchedPaths: readonly string[];
  readonly stdout: string;
  readonly stderr: string;
}

const PROTECTED_PATH = /(^|\/)(\.github|dist|node_modules)(\/|$)/;

export async function checkAndApplyGlmPatch(input: {
  readonly cwd: string;
  readonly patch: string;
  readonly apply: boolean;
}): Promise<SksResult<GlmPatchApplyResult>> {
  const parsed = parseUnifiedDiffPatch(input.patch);
  if (parsed.empty) {
    return issue('glm_patch_empty', 'GLM output did not contain a non-empty unified diff.');
  }
  const blockedPath = parsed.touchedPaths.find((file) => PROTECTED_PATH.test(file));
  if (blockedPath) {
    return issue('glm_patch_protected_path', `GLM patch touched protected path: ${blockedPath}`);
  }
  const check = await runGitApply(input.cwd, input.patch, ['apply', '--check', '--whitespace=nowarn', '-']);
  if (check.code !== 0) {
    return issue('glm_patch_gate_failed', check.stderr || check.stdout || 'git apply --check failed.');
  }
  if (!input.apply) {
    return {
      ok: true,
      value: {
        checked: true,
        applied: false,
        touchedPaths: parsed.touchedPaths,
        stdout: check.stdout,
        stderr: check.stderr
      }
    };
  }
  const applied = await runGitApply(input.cwd, input.patch, ['apply', '--whitespace=nowarn', '-']);
  if (applied.code !== 0) {
    return issue('glm_patch_apply_failed', applied.stderr || applied.stdout || 'git apply failed.');
  }
  return {
    ok: true,
    value: {
      checked: true,
      applied: true,
      touchedPaths: parsed.touchedPaths,
      stdout: applied.stdout,
      stderr: applied.stderr
    }
  };
}

function issue(code: string, message: string): SksResult<GlmPatchApplyResult> {
  return { ok: false, error: { code, message, severity: 'blocked' } };
}

function runGitApply(cwd: string, patch: string, args: readonly string[]): Promise<{
  readonly code: number | null;
  readonly stdout: string;
  readonly stderr: string;
}> {
  return new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      resolve({ code, stdout, stderr });
    };
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.stdin.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'EPIPE') stderr += `${stderr ? '\n' : ''}${error.message}`;
    });
    child.on('error', (error) => {
      stderr += `${stderr ? '\n' : ''}${error.message}`;
      finish(null);
    });
    child.on('close', finish);
    child.stdin.end(patch);
  });
}

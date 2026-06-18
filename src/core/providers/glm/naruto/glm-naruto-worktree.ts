import { spawn } from 'node:child_process';
import path from 'node:path';

export interface WorktreeInfo {
  readonly path: string;
  readonly workerId: string;
  readonly branch: string;
}

export async function createWorktree(repoRoot: string, missionId: string, workerId: string, baseCommit?: string): Promise<WorktreeInfo> {
  const branch = `sks-glm-naruto/${missionId}/${workerId}`;
  const worktreePath = path.join(repoRoot, '.sneakoscope', 'glm-naruto', 'worktrees', missionId, workerId);
  await runGit(repoRoot, ['worktree', 'add', '-b', branch, worktreePath, baseCommit || 'HEAD']);
  return { path: worktreePath, workerId, branch };
}

export async function removeWorktree(repoRoot: string, worktree: WorktreeInfo): Promise<void> {
  try {
    await runGit(repoRoot, ['worktree', 'remove', '--force', worktree.path]);
    await runGit(repoRoot, ['branch', '-D', worktree.branch]);
  } catch {
    // best-effort cleanup
  }
}

export async function applyPatchToWorktree(worktreePath: string, patch: string): Promise<{ ok: boolean; stderr: string }> {
  try {
    const result = await runGit(worktreePath, ['apply', '--whitespace=nowarn', '-'], patch);
    return { ok: result.code === 0, stderr: result.stderr };
  } catch (err) {
    return { ok: false, stderr: String(err) };
  }
}

export async function getWorktreeDiff(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ['diff', 'HEAD']);
  return result.stdout;
}

export async function resetWorktree(worktreePath: string): Promise<void> {
  await runGit(worktreePath, ['checkout', '--', '.']);
}

function runGit(cwd: string, args: readonly string[], stdin?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn('git', [...args], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.end(stdin);
    else child.stdin.end();
  });
}

import { spawn } from 'node:child_process';
import path from 'node:path';
import { ensureDir } from '../../../fsx.js';

export interface GlmNarutoWorktreeLease {
  readonly worker_id: string;
  readonly path: string;
  readonly branch: string;
  readonly base_commit: string;
}

export async function getGitRoot(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ['rev-parse', '--show-toplevel']);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export async function getGitHead(cwd: string): Promise<string | null> {
  const result = await runGit(cwd, ['rev-parse', 'HEAD']);
  return result.code === 0 ? result.stdout.trim() || null : null;
}

export async function createGlmNarutoWorkerWorktree(input: {
  readonly repoRoot: string;
  readonly missionId: string;
  readonly workerId: string;
  readonly baseCommit?: string | null;
}): Promise<GlmNarutoWorktreeLease> {
  const baseCommit = input.baseCommit || await getGitHead(input.repoRoot) || 'HEAD';
  const safeMission = input.missionId.replace(/[^A-Za-z0-9._:-]/g, '-');
  const root = path.join(input.repoRoot, '.sneakoscope', 'glm-naruto', safeMission, 'worktrees');
  await ensureDir(root);
  const safeWorker = input.workerId.replace(/[^A-Za-z0-9._:-]/g, '-');
  const worktreePath = path.join(root, safeWorker);
  const branch = `sks/glm-naruto/${safeMission}/${safeWorker}`.slice(0, 240);
  const result = await runGit(input.repoRoot, ['worktree', 'add', '-f', '-b', branch, worktreePath, baseCommit]);
  if (result.code !== 0) {
    throw new Error(result.stderr || result.stdout || 'git worktree add failed');
  }
  return { worker_id: input.workerId, path: worktreePath, branch, base_commit: baseCommit };
}

export async function applyPatchInWorktree(worktreePath: string, patch: string): Promise<{ ok: boolean; stderr: string }> {
  const checked = await runGit(worktreePath, ['apply', '--check', '--whitespace=nowarn', '-'], patch);
  if (checked.code !== 0) return { ok: false, stderr: checked.stderr || checked.stdout };
  const applied = await runGit(worktreePath, ['apply', '--whitespace=nowarn', '-'], patch);
  return { ok: applied.code === 0, stderr: applied.stderr || applied.stdout };
}

export async function diffWorktree(worktreePath: string): Promise<string> {
  const result = await runGit(worktreePath, ['diff', 'HEAD']);
  return result.stdout;
}

export async function removeGlmNarutoWorkerWorktree(repoRoot: string, lease: GlmNarutoWorktreeLease): Promise<{ ok: boolean; error?: string }> {
  const removed = await runGit(repoRoot, ['worktree', 'remove', '--force', lease.path]);
  const deleted = await runGit(repoRoot, ['branch', '-D', lease.branch]);
  if (removed.code !== 0) return { ok: false, error: removed.stderr || removed.stdout };
  if (deleted.code !== 0) return { ok: false, error: deleted.stderr || deleted.stdout };
  return { ok: true };
}

function runGit(cwd: string, args: readonly string[], input?: string): Promise<{
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
    child.stdin.end(input || '');
  });
}

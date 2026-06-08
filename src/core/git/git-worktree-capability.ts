import { ensureDir } from '../fsx.js'
import { detectGitRepo, type GitRepoDetection } from './git-repo-detection.js'
import { gitBlocker, runGitCommand } from './git-worktree-runner.js'
import { resolveGitWorktreeRoot, type GitWorktreeRootResolution } from './git-worktree-root.js'

export interface GitWorktreeCapability {
  schema: 'sks.git-worktree-capability.v1'
  ok: boolean
  mode: 'git-worktree' | 'patch-envelope-only'
  require_git_worktree: boolean
  git_available: boolean
  is_git_repo: boolean
  worktree_supported: boolean
  worktree_probe_attempted: boolean
  detection: GitRepoDetection
  root_resolution: GitWorktreeRootResolution | null
  blockers: string[]
}

export async function evaluateGitWorktreeCapability(input: {
  root?: string
  missionId?: string
  requireGitWorktree?: boolean
} = {}): Promise<GitWorktreeCapability> {
  const requireGitWorktree = input.requireGitWorktree === true || process.env.SKS_REQUIRE_GIT_WORKTREE === '1'
  const disabledByEnv = process.env.SKS_DISABLE_GIT_WORKTREE === '1'
  const detection = await detectGitRepo(input.root || process.cwd())
  const blockers: string[] = [...detection.blockers]
  const gitAvailable = Boolean(detection.git_binary)
  if (!detection.is_git_repo || !detection.root) {
    if (requireGitWorktree) blockers.push('git_worktree_required_but_not_git_repo')
    return {
      schema: 'sks.git-worktree-capability.v1',
      ok: blockers.length === 0,
      mode: 'patch-envelope-only',
      require_git_worktree: requireGitWorktree,
      git_available: gitAvailable,
      is_git_repo: false,
      worktree_supported: false,
      worktree_probe_attempted: false,
      detection,
      root_resolution: null,
      blockers
    }
  }
  if (disabledByEnv) {
    if (requireGitWorktree) blockers.push('git_worktree_disabled_by_env')
    return {
      schema: 'sks.git-worktree-capability.v1',
      ok: blockers.length === 0,
      mode: 'patch-envelope-only',
      require_git_worktree: requireGitWorktree,
      git_available: gitAvailable,
      is_git_repo: true,
      worktree_supported: false,
      worktree_probe_attempted: false,
      detection,
      root_resolution: null,
      blockers: [...new Set(blockers)]
    }
  }

  const rootResolution = resolveGitWorktreeRoot({
    repoRoot: detection.root,
    missionId: input.missionId || 'capability'
  })
  blockers.push(...rootResolution.blockers)
  if (rootResolution.ok) await ensureDir(rootResolution.root)
  const list = await runGitCommand(detection.root, ['worktree', 'list', '--porcelain'])
  const worktreeSupported = list.ok
  if (!worktreeSupported) blockers.push(gitBlocker('git_worktree_list_failed', list))
  if (requireGitWorktree && !worktreeSupported) blockers.push('git_worktree_required_but_unsupported')

  return {
    schema: 'sks.git-worktree-capability.v1',
    ok: blockers.length === 0,
    mode: blockers.length === 0 && worktreeSupported ? 'git-worktree' : 'patch-envelope-only',
    require_git_worktree: requireGitWorktree,
    git_available: gitAvailable,
    is_git_repo: true,
    worktree_supported: worktreeSupported,
    worktree_probe_attempted: true,
    detection,
    root_resolution: rootResolution,
    blockers: [...new Set(blockers)]
  }
}

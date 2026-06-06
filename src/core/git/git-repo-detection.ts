import path from 'node:path'
import { which } from '../fsx.js'
import { gitBlocker, gitOutputLine, runGitCommand } from './git-worktree-runner.js'

export interface GitRepoDetection {
  schema: 'sks.git-repo-detection.v1'
  ok: boolean
  cwd: string
  git_binary: string | null
  is_git_repo: boolean
  inside_work_tree: boolean
  bare: boolean
  root: string | null
  git_dir: string | null
  common_dir: string | null
  worktree_git_dir: string | null
  branch: string | null
  head: string | null
  main_worktree_dirty: boolean
  status_porcelain: string
  blockers: string[]
}

export async function detectGitRepo(root: string = process.cwd()): Promise<GitRepoDetection> {
  const cwd = path.resolve(root)
  const gitBinary = await which('git')
  const blockers: string[] = []
  if (!gitBinary) {
    return baseDetection(cwd, null, false, ['git_binary_missing'])
  }

  const inside = await runGitCommand(cwd, ['rev-parse', '--is-inside-work-tree'])
  if (!inside.ok || gitOutputLine(inside) !== 'true') {
    return baseDetection(cwd, gitBinary, true, [])
  }

  const top = await runGitCommand(cwd, ['rev-parse', '--show-toplevel'])
  const gitDir = await runGitCommand(cwd, ['rev-parse', '--git-dir'])
  const commonDir = await runGitCommand(cwd, ['rev-parse', '--git-common-dir'])
  const bare = await runGitCommand(cwd, ['rev-parse', '--is-bare-repository'])
  const branch = await runGitCommand(cwd, ['branch', '--show-current'])
  const head = await runGitCommand(cwd, ['rev-parse', 'HEAD'])
  const status = await runGitCommand(cwd, ['status', '--porcelain=v1', '--untracked-files=all'])

  if (!top.ok) blockers.push(gitBlocker('git_root_unresolved', top))
  if (!gitDir.ok) blockers.push(gitBlocker('git_dir_unresolved', gitDir))
  if (!commonDir.ok) blockers.push(gitBlocker('git_common_dir_unresolved', commonDir))
  if (!head.ok) blockers.push(gitBlocker('git_head_unresolved', head))
  if (!status.ok) blockers.push(gitBlocker('git_status_unresolved', status))

  const repoRoot = top.ok ? path.resolve(gitOutputLine(top)) : null
  const resolvedGitDir = gitDir.ok ? absolutizeGitPath(cwd, gitOutputLine(gitDir)) : null
  const resolvedCommonDir = commonDir.ok ? absolutizeGitPath(cwd, gitOutputLine(commonDir)) : null

  return {
    schema: 'sks.git-repo-detection.v1',
    ok: blockers.length === 0,
    cwd,
    git_binary: gitBinary,
    is_git_repo: true,
    inside_work_tree: true,
    bare: gitOutputLine(bare) === 'true',
    root: repoRoot,
    git_dir: resolvedGitDir,
    common_dir: resolvedCommonDir,
    worktree_git_dir: resolvedGitDir && resolvedCommonDir && resolvedGitDir !== resolvedCommonDir ? resolvedGitDir : null,
    branch: gitOutputLine(branch) || null,
    head: gitOutputLine(head) || null,
    main_worktree_dirty: status.ok && status.stdout.trim().length > 0,
    status_porcelain: status.stdout || '',
    blockers
  }
}

function baseDetection(cwd: string, gitBinary: string | null, gitAvailable: boolean, blockers: string[]): GitRepoDetection {
  return {
    schema: 'sks.git-repo-detection.v1',
    ok: gitAvailable || blockers.length === 0,
    cwd,
    git_binary: gitBinary,
    is_git_repo: false,
    inside_work_tree: false,
    bare: false,
    root: null,
    git_dir: null,
    common_dir: null,
    worktree_git_dir: null,
    branch: null,
    head: null,
    main_worktree_dirty: false,
    status_porcelain: '',
    blockers
  }
}

function absolutizeGitPath(cwd: string, value: string): string | null {
  if (!value) return null
  return path.isAbsolute(value) ? path.resolve(value) : path.resolve(cwd, value)
}

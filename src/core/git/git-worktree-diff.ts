import path from 'node:path'
import { nowIso } from '../fsx.js'
import { gitOutputLine, runGitCommand } from './git-worktree-runner.js'

export interface GitWorktreeDiff {
  schema: 'sks.git-worktree-diff.v1'
  ok: boolean
  generated_at: string
  mission_id: string
  worker_id: string
  main_repo_root: string
  worktree_path: string
  branch: string | null
  base_head: string | null
  worktree_head: string | null
  status_porcelain: string
  changed_files: string[]
  untracked_files: string[]
  diff: string
  diff_bytes: number
  clean: boolean
  blockers: string[]
}

export async function exportGitWorktreeDiff(input: {
  mainRepoRoot: string
  worktreePath: string
  missionId: string
  workerId: string
}): Promise<GitWorktreeDiff> {
  const worktreePath = path.resolve(input.worktreePath)
  const blockers: string[] = []
  const branch = await runGitCommand(worktreePath, ['branch', '--show-current'])
  const head = await runGitCommand(worktreePath, ['rev-parse', 'HEAD'])
  const status = await runGitCommand(worktreePath, ['status', '--porcelain=v1', '--untracked-files=all'])
  const untracked = await runGitCommand(worktreePath, ['ls-files', '--others', '--exclude-standard'])
  const untrackedFiles = lines(untracked.stdout)
  if (untrackedFiles.length) {
    const addIntent = await runGitCommand(worktreePath, ['add', '-N', '--', ...untrackedFiles])
    if (!addIntent.ok) blockers.push('git_worktree_untracked_intent_to_add_failed')
  }
  const diff = await runGitCommand(worktreePath, ['diff', '--binary', '--full-index', 'HEAD'])
  const names = await runGitCommand(worktreePath, ['diff', '--name-only', 'HEAD'])
  if (!status.ok) blockers.push('git_worktree_status_failed')
  if (!diff.ok) blockers.push('git_worktree_diff_failed')
  const trackedChanged = lines(names.stdout)
  const changedFiles = [...new Set([...trackedChanged, ...untrackedFiles, ...statusFiles(status.stdout)])]
  return {
    schema: 'sks.git-worktree-diff.v1',
    ok: blockers.length === 0,
    generated_at: nowIso(),
    mission_id: input.missionId,
    worker_id: input.workerId,
    main_repo_root: path.resolve(input.mainRepoRoot),
    worktree_path: worktreePath,
    branch: gitOutputLine(branch) || null,
    base_head: null,
    worktree_head: gitOutputLine(head) || null,
    status_porcelain: status.stdout,
    changed_files: changedFiles,
    untracked_files: untrackedFiles,
    diff: diff.stdout,
    diff_bytes: Buffer.byteLength(diff.stdout),
    clean: changedFiles.length === 0 && status.stdout.trim().length === 0,
    blockers
  }
}

function lines(text: string): string[] {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
}

function statusFiles(text: string): string[] {
  return lines(text).map((line) => {
    const match = line.match(/^.{2}\s+(.*)$/) || line.match(/^\S+\s+(.*)$/)
    const file = (match?.[1] || line).trim()
    return file.includes(' -> ') ? file.split(' -> ').pop()?.trim() || file : file
  }).filter(Boolean)
}

import path from 'node:path'
import fsp from 'node:fs/promises'
import { ensureDir, nowIso, writeJsonAtomic } from '../fsx.js'
import { evaluateGitWorktreeCapability, type GitWorktreeCapability } from './git-worktree-capability.js'
import { gitBlocker, gitOutputLine, runGitCommand } from './git-worktree-runner.js'
import { sanitizePathPart } from './git-worktree-root.js'

export interface GitWorkerWorktreeAllocation {
  schema: 'sks.git-worktree-allocation.v1'
  ok: boolean
  created_at: string
  mission_id: string
  worker_id: string
  slot_id: string
  generation_index: number
  repo_root: string
  main_repo_root: string
  worktree_path: string
  branch: string
  base_ref: string
  base_head: string | null
  manifest_path: string
  capability: GitWorktreeCapability
  blockers: string[]
}

export async function allocateWorkerWorktree(input: {
  repoRoot?: string
  missionId: string
  workerId: string
  slotId?: string
  generationIndex?: number
  baseRef?: string
  branchPrefix?: string
}): Promise<GitWorkerWorktreeAllocation> {
  const capability = await evaluateGitWorktreeCapability({
    root: input.repoRoot || process.cwd(),
    missionId: input.missionId,
    requireGitWorktree: true
  })
  const repoRoot = capability.detection.root || path.resolve(input.repoRoot || process.cwd())
  const root = capability.root_resolution?.root || path.join(repoRoot, '.sneakoscope', 'blocked-worktrees')
  const workerId = sanitizePathPart(input.workerId)
  const slotId = sanitizePathPart(input.slotId || workerId)
  const generationIndex = Math.max(1, Math.floor(Number(input.generationIndex || 1)))
  const baseRef = input.baseRef || capability.detection.head || 'HEAD'
  const branchPrefix = sanitizeBranchPart(input.branchPrefix || 'sks')
  const branch = `${branchPrefix}/${sanitizeBranchPart(input.missionId)}/${sanitizeBranchPart(slotId)}-gen-${generationIndex}-${workerId}`
  const worktreePath = path.join(root, `${slotId}-gen-${generationIndex}-${workerId}`)
  const blockers = [...capability.blockers]
  let baseHead: string | null = capability.detection.head

  if (capability.ok) {
    await ensureDir(root)
    let add: Awaited<ReturnType<typeof runGitCommand>> | null = null
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      if (attempt > 1) {
        await sleep(250 * attempt)
        await runGitCommand(repoRoot, ['worktree', 'prune'], { timeoutMs: 30000 }).catch(() => null)
        await fsp.rm(worktreePath, { recursive: true, force: true }).catch(() => null)
      }
      const existingBranch = await runGitCommand(repoRoot, ['show-ref', '--verify', '--quiet', `refs/heads/${branch}`])
      const args = existingBranch.ok
        ? ['worktree', 'add', worktreePath, branch]
        : ['worktree', 'add', '-b', branch, worktreePath, baseRef]
      add = await runGitCommand(repoRoot, args, { timeoutMs: 120000 })
      if (add.ok) break
    }
    if (!add?.ok) blockers.push(gitBlocker('git_worktree_add_failed', add!))
    if (add?.ok) {
      const head = await runGitCommand(worktreePath, ['rev-parse', 'HEAD'])
      baseHead = head.ok ? gitOutputLine(head) : baseHead
    }
  }

  const allocation: GitWorkerWorktreeAllocation = {
    schema: 'sks.git-worktree-allocation.v1',
    ok: blockers.length === 0,
    created_at: nowIso(),
    mission_id: input.missionId,
    worker_id: workerId,
    slot_id: slotId,
    generation_index: generationIndex,
    repo_root: repoRoot,
    main_repo_root: repoRoot,
    worktree_path: worktreePath,
    branch,
    base_ref: baseRef,
    base_head: baseHead,
    manifest_path: path.join(root, 'git-worktree-manifest.json'),
    capability,
    blockers: [...new Set(blockers)]
  }
  await appendWorktreeManifest(allocation)
  return allocation
}

async function appendWorktreeManifest(allocation: GitWorkerWorktreeAllocation) {
  const manifest = {
    schema: 'sks.git-worktree-manifest.v1',
    updated_at: nowIso(),
    mission_id: allocation.mission_id,
    repo_root: allocation.repo_root,
    root: path.dirname(allocation.worktree_path),
    allocations: [allocation]
  }
  await writeJsonAtomic(allocation.manifest_path, manifest)
}

function sanitizeBranchPart(value: string): string {
  return sanitizePathPart(value).replace(/\./g, '-').slice(0, 48) || 'item'
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

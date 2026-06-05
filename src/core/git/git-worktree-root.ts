import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { sha256 } from '../fsx.js'

export interface GitWorktreeRootResolution {
  schema: 'sks.git-worktree-root.v1'
  ok: boolean
  repo_root: string
  mission_id: string
  root: string
  source: 'SKS_WORKTREE_ROOT' | 'XDG_CACHE_HOME' | 'HOME_CACHE'
  repo_hash: string
  in_repo: boolean
  allow_in_repo: boolean
  blockers: string[]
}

export function resolveGitWorktreeRoot(input: {
  repoRoot: string
  missionId: string
  env?: NodeJS.ProcessEnv
}): GitWorktreeRootResolution {
  const env = input.env || process.env
  const repoRoot = path.resolve(input.repoRoot)
  const missionId = sanitizePathPart(input.missionId || 'mission')
  const repoHash = sha256(repoRoot).slice(0, 16)
  const explicitRoot = env.SKS_WORKTREE_ROOT ? path.resolve(env.SKS_WORKTREE_ROOT) : null
  const source = explicitRoot ? 'SKS_WORKTREE_ROOT' : env.XDG_CACHE_HOME ? 'XDG_CACHE_HOME' : 'HOME_CACHE'
  const cacheBase = explicitRoot || path.join(env.XDG_CACHE_HOME || path.join(env.HOME || os.homedir(), '.cache'), 'sks', 'worktrees')
  const root = explicitRoot ? path.join(cacheBase, repoHash, missionId) : path.join(cacheBase, repoHash, missionId)
  const inRepo = isPathInside(root, repoRoot)
  const allowInRepo = env.SKS_ALLOW_IN_REPO_WORKTREES === '1'
  const blockers = inRepo && !allowInRepo ? ['git_worktree_root_inside_repo_blocked'] : []
  return {
    schema: 'sks.git-worktree-root.v1',
    ok: blockers.length === 0,
    repo_root: repoRoot,
    mission_id: missionId,
    root,
    source,
    repo_hash: repoHash,
    in_repo: inRepo,
    allow_in_repo: allowInRepo,
    blockers
  }
}

export function sanitizePathPart(value: string): string {
  return String(value || 'item').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item'
}

export function isPathInside(candidate: string, parent: string): boolean {
  const canonicalParent = canonicalPath(parent)
  const canonicalCandidate = canonicalPath(candidate)
  const rel = path.relative(canonicalParent, canonicalCandidate)
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

function canonicalPath(value: string): string {
  const resolved = path.resolve(value)
  try {
    return fs.realpathSync.native(resolved)
  } catch {
    const parent = path.dirname(resolved)
    if (parent === resolved) return resolved
    const base = canonicalPath(parent)
    return path.join(base, path.basename(resolved))
  }
}

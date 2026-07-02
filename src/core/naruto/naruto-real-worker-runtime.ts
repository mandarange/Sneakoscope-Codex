import fs from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { allocateWorkerWorktree } from '../git/git-worktree-manager.js'
import { cleanupGitWorktree } from '../git/git-worktree-cleanup.js'
import type { NarutoWorkItem } from './naruto-work-item.js'
import type { NarutoWorkerPlacementDecision } from './naruto-active-pool.js'

export interface NarutoActualWorkerHandle {
  id: string
  item: NarutoWorkItem
  placement: NarutoWorkerPlacementDecision
  started_at: number
  pid: number | null
  child: ChildProcess
  worker_artifact_dir: string
  result_path: string
  heartbeat_path: string
  worktree: any | null
  exit: Promise<{ code: number | null; signal: NodeJS.Signals | null }>
}

export async function spawnActualNarutoWorker(input: {
  root: string
  missionId: string
  item: NarutoWorkItem
  placement: NarutoWorkerPlacementDecision
  backend: string
  parentPrompt?: string | null
  worktreePolicy?: any
  preparedAllocation?: any
  zellijSessionName?: string | null
  visiblePaneCap: number
}): Promise<NarutoActualWorkerHandle> {
  const workerDir = path.join(input.root, '.sneakoscope', 'missions', input.missionId, 'agents', 'naruto-real-workers', input.item.id)
  await ensureDir(workerDir)
  let worktree: any = null
  if (input.worktreePolicy?.mode === 'git-worktree' && input.item.write_allowed === true) {
    const allocation = input.preparedAllocation?.ok === true
      ? { ...input.preparedAllocation, source: 'prewarmed_pool' }
      : await allocateWorkerWorktree({
        repoRoot: input.worktreePolicy.main_repo_root || input.root,
        missionId: input.missionId,
        workerId: input.item.id,
        slotId: input.item.id.replace(/[^A-Za-z0-9_-]/g, '-'),
        generationIndex: 1
      }).catch((err: any) => ({ ok: false, blockers: [`git_worktree_allocate_exception:${err?.message || String(err)}`] }))
    await writeJsonAtomic(path.join(workerDir, 'git-worktree-allocation.json'), allocation)
    if ((allocation as any).ok) worktree = allocation
  }
  const resultPath = path.join(workerDir, 'worker-result.json')
  const heartbeatPath = path.join(workerDir, 'worker-heartbeat.jsonl')
  const intakePath = path.join(workerDir, 'worker-intake.json')
  await writeJsonAtomic(intakePath, {
    schema: 'sks.naruto-actual-worker-intake.v1',
    generated_at: nowIso(),
    mission_id: input.missionId,
    item: input.item,
    parent_prompt: normalizeWorkerPromptText(input.parentPrompt),
    placement: input.placement,
    backend: input.backend,
    result_path: resultPath,
    heartbeat_path: heartbeatPath,
    worktree_path: worktree?.worktree_path || null,
    zellij_session_name: input.zellijSessionName || null,
    visible_pane_cap: input.visiblePaneCap
  })
  const child = spawn(process.execPath, [actualWorkerEntrypoint(), intakePath], {
    cwd: worktree?.worktree_path || input.root,
    stdio: ['ignore', 'ignore', 'ignore']
  })
  const exit = waitForExit(child, 30000)
  return {
    id: input.item.id,
    item: input.item,
    placement: input.placement,
    started_at: Date.now(),
    pid: child.pid || null,
    child,
    worker_artifact_dir: workerDir,
    result_path: resultPath,
    heartbeat_path: heartbeatPath,
    worktree,
    exit
  }
}

export async function collectActualNarutoWorker(handle: NarutoActualWorkerHandle) {
  const exit = await handle.exit
  const result = await readJson<any>(handle.result_path, null).catch(() => null)
  const blockers = [
    ...(exit.code === 0 ? [] : [`naruto_actual_worker_exit_${exit.code ?? exit.signal ?? 'unknown'}`]),
    ...(result?.ok === false ? result.blockers || ['naruto_actual_worker_result_not_ok'] : []),
    ...(result ? [] : ['naruto_actual_worker_result_missing'])
  ]
  if (handle.worktree?.worktree_path) {
    const cleanup = await cleanupGitWorktree({
      repoRoot: handle.worktree.main_repo_root || handle.worktree.repo_root || handle.worktree.repoRoot || '',
      worktreePath: handle.worktree.worktree_path,
      branch: handle.worktree.branch,
      deleteBranch: true
    }).catch((err: any) => ({ ok: false, blockers: [`git_worktree_cleanup_exception:${err?.message || String(err)}`] }))
    await writeJsonAtomic(path.join(handle.worker_artifact_dir, 'git-worktree-cleanup.json'), cleanup)
    blockers.push(...((cleanup as any).blockers || []))
  }
  return {
    id: handle.id,
    ok: blockers.length === 0,
    item: handle.item,
    placement: handle.placement,
    completed_at: Date.now(),
    pid: handle.pid,
    worker_artifact_dir: handle.worker_artifact_dir,
    blockers
  }
}

function normalizeWorkerPromptText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 4000)
}

function actualWorkerEntrypoint(): string {
  return fileURLToPath(new URL('./naruto-real-worker-child.js', import.meta.url))
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: NodeJS.Signals | null }> {
  return new Promise((resolve) => {
    let settled = false
    let killTimer: NodeJS.Timeout | null = null
    const finish = (code: number | null, signal: NodeJS.Signals | null) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (killTimer) clearTimeout(killTimer)
      resolve({ code, signal })
    }
    const timer = setTimeout(() => {
      if (!child.killed) child.kill()
      killTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL')
        finish(null, 'SIGKILL')
      }, 5000)
    }, Math.max(1000, timeoutMs))
    child.on('close', (code, signal) => {
      finish(code, signal)
    })
    child.on('error', () => {
      finish(1, null)
    })
  })
}

import fs from 'node:fs'
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { allocateWorkerWorktree } from '../git/git-worktree-manager.js'
import { cleanupGitWorktree } from '../git/git-worktree-cleanup.js'
import type { NarutoWorkItem } from './naruto-work-item.js'
import type { NarutoWorkerPlacementDecision } from './naruto-active-pool.js'
import { normalizeWorkerPromptText } from './normalize-worker-prompt-text.js'

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

// Must match naruto-real-worker-child.ts's normalizeMaxRuntimeMs() default —
// that is the deadline the child schedules its own graceful self-termination
// against (writes a 'timed_out' result, then process.exit(124)).
const DEFAULT_MAX_RUNTIME_MS = 10 * 60 * 1000
// Extra time the parent waits beyond maxRuntimeMs before force-killing, so
// the child's own graceful deadman-timeout gets a chance to fire first
// (20차 P1-4: previously the parent hard-killed at a fixed 30s regardless
// of what the child's own timeout was configured to, discarding any real
// codex task's result before it could even finish).
const PARENT_GRACE_MS = 15_000

// Tracks every currently-live worker child so a parent-process interrupt can
// clean the whole runtime up (20차 P1-5). Children are spawned detached (own
// process group) specifically so killAllActiveNarutoWorkers's process-group
// signal reaches any grandchildren (e.g. a codex CLI subprocess) too, not
// just the immediate child — a plain (non-detached) spawn has no separate
// group for `kill(-pid)` to target.
const activeWorkers = new Map<number, { worktreePath: string | null }>()

export function activeNarutoWorkerCount(): number {
  return activeWorkers.size
}

export function killAllActiveNarutoWorkers(signal: NodeJS.Signals = 'SIGTERM'): void {
  for (const pid of activeWorkers.keys()) sendProcessGroupSignal(pid, signal)
}

export function activeNarutoWorktreePaths(): string[] {
  return [...activeWorkers.values()].map((entry) => entry.worktreePath).filter((value): value is string => Boolean(value))
}

function sendProcessGroupSignal(pid: number, signal: NodeJS.Signals): void {
  /* intentional: the pid/process-group may already be dead (ESRCH) by the time this fires — that's the expected common case, not an error */
  if (process.platform !== 'win32') {
    try { process.kill(-pid, signal) } catch {}
  }
  try { process.kill(pid, signal) } catch {}
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
  maxRuntimeMs?: number
}): Promise<NarutoActualWorkerHandle> {
  const maxRuntimeMs = Number.isFinite(input.maxRuntimeMs) && Number(input.maxRuntimeMs) > 0
    ? Number(input.maxRuntimeMs)
    : DEFAULT_MAX_RUNTIME_MS
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
  const normalizedParentPrompt = normalizeWorkerPromptText(input.parentPrompt)
  await writeJsonAtomic(intakePath, {
    schema: 'sks.naruto-actual-worker-intake.v1',
    generated_at: nowIso(),
    mission_id: input.missionId,
    item: input.item,
    parent_prompt: normalizedParentPrompt.text,
    parent_prompt_truncated: normalizedParentPrompt.truncated,
    parent_prompt_dropped_chars: normalizedParentPrompt.dropped_chars,
    placement: input.placement,
    backend: input.backend,
    result_path: resultPath,
    heartbeat_path: heartbeatPath,
    worktree_path: worktree?.worktree_path || null,
    zellij_session_name: input.zellijSessionName || null,
    visible_pane_cap: input.visiblePaneCap,
    max_runtime_ms: maxRuntimeMs
  })
  const child = spawn(process.execPath, [actualWorkerEntrypoint(), intakePath], {
    cwd: worktree?.worktree_path || input.root,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: process.platform !== 'win32'
  })
  if (child.pid) activeWorkers.set(child.pid, { worktreePath: worktree?.worktree_path || null })
  const exit = waitForExit(child, maxRuntimeMs + PARENT_GRACE_MS).finally(() => {
    if (child.pid) activeWorkers.delete(child.pid)
  })
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
  /* intentional: readJson already falls back to null internally; the outer .catch is defensive redundancy, a missing/corrupt result file is expected when the worker crashed before writing it (surfaced below via naruto_actual_worker_result_missing) */
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

import fsp from 'node:fs/promises'
import path from 'node:path'
import { appendJsonl, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { drainTmuxLaneSupervisor } from './tmux-lane-supervisor.js'
import { normalizeAgentSessionRows } from './agent-session-rows.js'

export const AGENT_CLEANUP_PROOF_SCHEMA = 'sks.agent-cleanup-proof.v1'
export const AGENT_CLEANUP_ACTION_LEDGER_SCHEMA = 'sks.agent-cleanup-action-ledger.v1'

export interface AgentCleanupExecutorOptions {
  missionDir: string
  missionId?: string | null
  action?: 'cleanup' | 'close'
  apply?: boolean
  dryRun?: boolean
  drain?: boolean
  staleMs?: number
}

type CleanupActionKind = 'terminate_process' | 'close_tmux_pane' | 'remove_temp_dir' | 'remove_lock' | 'skip_active_session' | 'skip_foreign_namespace' | 'archive_transcript_keep'

interface CleanupAction {
  kind: CleanupActionKind
  target: string
  status: 'planned' | 'applied' | 'skipped' | 'failed'
  reason: string
  error?: string
}

const TERMINAL_STATUSES = new Set(['closed', 'completed', 'done', 'failed', 'blocked', 'killed', 'timed_out'])

export async function runAgentCleanupExecutor(opts: AgentCleanupExecutorOptions) {
  const agentRoot = path.join(opts.missionDir, 'agents')
  const action = opts.action || 'cleanup'
  const apply = opts.apply === true && opts.dryRun !== true
  if (action === 'close' && opts.drain === true) await drainTmuxLaneSupervisor(agentRoot).catch(() => null)
  const namespace = await readJson<any>(path.join(opts.missionDir, 'project-session-namespace.json'), null)
  const sessionsRaw = await readJson<any>(path.join(agentRoot, 'agent-sessions.json'), { sessions: {} })
  const sessions = normalizeAgentSessionRows(sessionsRaw)
  const activeSessionIds = new Set(
    sessions
      .filter((row: any) => !TERMINAL_STATUSES.has(String(row.status || row.lifecycle_state || '')))
      .map((row: any) => String(row.session_id || row.id || row.agent_id || ''))
      .filter(Boolean)
  )
  const now = Date.now()
  const staleMs = opts.staleMs ?? 30 * 60 * 1000
  const actions: CleanupAction[] = []
  const processReports = await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-process-report.json')
  for (const file of processReports) {
    const report = await readJson<any>(file, null)
    const pid = Number(report?.pid || 0)
    const sessionId = String(report?.session_id || '')
    const status = String(sessions.find((row: any) => String(row.session_id || '') === sessionId)?.status || '')
    const terminal = TERMINAL_STATUSES.has(status) || report?.exit_code !== null
    if (!pid || !processIsAlive(pid)) continue
    if (activeSessionIds.has(sessionId) && !terminal) {
      actions.push({ kind: 'skip_active_session', target: sessionId || String(pid), status: 'skipped', reason: 'session_active' })
      continue
    }
    actions.push(await applyAction({
      kind: 'terminate_process',
      target: String(pid),
      reason: terminal ? 'terminal_session_process_alive' : 'stale_session_process',
      apply,
      run: async () => {
        process.kill(pid, 'SIGTERM')
      }
    }))
  }
  const tmuxReports = await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-tmux-report.json')
  for (const file of tmuxReports) {
    const report = await readJson<any>(file, null)
    const paneId = String(report?.pane_id || '')
    const sessionId = String(report?.session_id || '')
    if (!validTmuxPaneId(paneId)) continue
    if (activeSessionIds.has(sessionId)) {
      actions.push({ kind: 'skip_active_session', target: sessionId || paneId, status: 'skipped', reason: 'tmux_session_active' })
      continue
    }
    actions.push(await applyAction({
      kind: 'close_tmux_pane',
      target: paneId,
      reason: 'stale_tmux_pane',
      apply,
      run: async () => {
        const { runProcess } = await import('../fsx.js')
        await runProcess('tmux', ['kill-pane', '-t', paneId], { timeoutMs: 3000, maxOutputBytes: 4096 })
      }
    }))
  }
  const projectHash = String(namespace?.root_hash || '')
  for (const dir of Array.isArray(namespace?.orphan_temp_dirs) ? namespace.orphan_temp_dirs.map(String) : []) {
    if (!namespaceOwnsPath(dir, projectHash)) {
      actions.push({ kind: 'skip_foreign_namespace', target: dir, status: 'skipped', reason: 'path_outside_project_namespace' })
      continue
    }
    if (!(await exists(dir))) continue
    actions.push(await applyAction({
      kind: 'remove_temp_dir',
      target: dir,
      reason: 'orphan_temp_dir',
      apply,
      run: async () => fsp.rm(dir, { recursive: true, force: true })
    }))
  }
  for (const lock of await staleLockFiles(String(namespace?.lock_dir || ''), projectHash, now, staleMs)) {
    actions.push(await applyAction({
      kind: 'remove_lock',
      target: lock,
      reason: 'stale_lock_file',
      apply,
      run: async () => fsp.rm(lock, { force: true })
    }))
  }
  for (const transcript of await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-terminal-session.json')) {
    actions.push({ kind: 'archive_transcript_keep', target: transcript, status: 'skipped', reason: 'terminal_transcripts_are_preserved' })
  }
  const proof = buildCleanupProof({
    generatedAt: nowIso(),
    missionId: opts.missionId || namespace?.mission_id || null,
    projectNamespace: projectHash || null,
    action,
    apply,
    dryRun: !apply,
    actions,
    activeSessionIds: [...activeSessionIds]
  })
  await writeJsonAtomic(path.join(agentRoot, 'agent-cleanup-proof.json'), proof)
  await writeJsonAtomic(path.join(agentRoot, 'agent-command-cleanup.json'), {
    schema: 'sks.agent-command-cleanup.v2',
    ok: proof.ok,
    mission_id: proof.mission_id,
    action,
    cleanup_executor: 'agent-cleanup-proof.json',
    cleanup_action_ledger: 'agent-cleanup-action-ledger.jsonl',
    applied: apply,
    blockers: proof.blockers
  })
  for (const row of actions) {
    await appendJsonl(path.join(agentRoot, 'agent-cleanup-action-ledger.jsonl'), {
      schema: AGENT_CLEANUP_ACTION_LEDGER_SCHEMA,
      generated_at: proof.generated_at,
      action: row
    })
  }
  return proof
}

function buildCleanupProof(input: {
  generatedAt: string
  missionId: string | null
  projectNamespace: string | null
  action: string
  apply: boolean
  dryRun: boolean
  actions: CleanupAction[]
  activeSessionIds: string[]
}) {
  const byKind = (kind: CleanupActionKind, status?: CleanupAction['status']) => input.actions.filter((row) => row.kind === kind && (!status || row.status === status))
  const failed = input.actions.filter((row) => row.status === 'failed')
  return {
    schema: AGENT_CLEANUP_PROOF_SCHEMA,
    generated_at: input.generatedAt,
    ok: failed.length === 0,
    mission_id: input.missionId,
    project_namespace: input.projectNamespace,
    action: input.action,
    dry_run: input.dryRun,
    apply: input.apply,
    stale_processes_found: byKind('terminate_process').map((row) => row.target),
    stale_processes_killed: byKind('terminate_process', 'applied').map((row) => row.target),
    stale_tmux_panes_found: byKind('close_tmux_pane').map((row) => row.target),
    stale_tmux_panes_closed: byKind('close_tmux_pane', 'applied').map((row) => row.target),
    orphan_temp_dirs_found: byKind('remove_temp_dir').map((row) => row.target),
    orphan_temp_dirs_removed: byKind('remove_temp_dir', 'applied').map((row) => row.target),
    stale_locks_found: byKind('remove_lock').map((row) => row.target),
    stale_locks_removed: byKind('remove_lock', 'applied').map((row) => row.target),
    skipped_active_sessions: [...new Set([...input.activeSessionIds, ...byKind('skip_active_session').map((row) => row.target)])].filter(Boolean),
    skipped_foreign_namespace: byKind('skip_foreign_namespace').map((row) => row.target),
    terminal_transcripts_preserved: byKind('archive_transcript_keep').map((row) => row.target),
    action_count: input.actions.length,
    applied_count: input.actions.filter((row) => row.status === 'applied').length,
    failed_count: failed.length,
    actions: input.actions,
    blockers: failed.map((row) => `cleanup_action_failed:${row.kind}:${row.target}`)
  }
}

async function applyAction(input: { kind: CleanupActionKind; target: string; reason: string; apply: boolean; run: () => Promise<void> | void }): Promise<CleanupAction> {
  if (!input.apply) return { kind: input.kind, target: input.target, status: 'planned', reason: input.reason }
  try {
    await input.run()
    return { kind: input.kind, target: input.target, status: 'applied', reason: input.reason }
  } catch (err: unknown) {
    return { kind: input.kind, target: input.target, status: 'failed', reason: input.reason, error: err instanceof Error ? err.message : String(err) }
  }
}

async function staleLockFiles(lockDir: string, projectHash: string, now: number, staleMs: number) {
  const out: string[] = []
  if (!lockDir || !namespaceOwnsPath(lockDir, projectHash) || !(await exists(lockDir))) return out
  for (const file of await listFiles(lockDir)) {
    const stat = await fsp.stat(file).catch(() => null)
    if (stat && now - stat.mtimeMs > staleMs) out.push(file)
  }
  return out
}

async function listNamedFiles(dir: string, name: string): Promise<string[]> {
  return (await listFiles(dir)).filter((file) => path.basename(file) === name)
}

async function listFiles(dir: string): Promise<string[]> {
  const out: string[] = []
  if (!(await exists(dir))) return out
  for (const entry of await fsp.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...await listFiles(file))
    else if (entry.isFile()) out.push(file)
  }
  return out
}

function namespaceOwnsPath(candidate: string, projectHash: string) {
  return Boolean(candidate && (!projectHash || candidate.includes(projectHash)))
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function validTmuxPaneId(value: string) {
  return /^%\d+$/.test(value)
}

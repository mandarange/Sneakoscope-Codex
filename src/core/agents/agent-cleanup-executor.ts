import fsp from 'node:fs/promises'
import path from 'node:path'
import { appendJsonl, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { drainTmuxLaneSupervisor } from './tmux-lane-supervisor.js'
import { normalizeAgentSessionRows } from './agent-session-rows.js'

export const AGENT_CLEANUP_PROOF_SCHEMA = 'sks.agent-cleanup-proof.v2'
export const AGENT_CLEANUP_ACTION_LEDGER_SCHEMA = 'sks.agent-cleanup-action-ledger.v1'

export interface AgentCleanupExecutorOptions {
  missionDir: string
  missionId?: string | null
  action?: 'cleanup' | 'close'
  apply?: boolean
  dryRun?: boolean
  drain?: boolean
  staleMs?: number
  graceMs?: number
  killEscalation?: boolean
}

type CleanupActionKind = 'terminate_process' | 'close_tmux_pane' | 'remove_temp_dir' | 'remove_lock' | 'skip_active_session' | 'skip_foreign_namespace' | 'archive_transcript_keep'

interface CleanupAction {
  kind: CleanupActionKind
  target: string
  status: 'planned' | 'applied' | 'skipped' | 'failed'
  reason: string
  error?: string
  process_tree?: ProcessTreeEntry[]
  before?: Record<string, unknown>
  after?: Record<string, unknown>
  signal_sequence?: string[]
  grace_ms?: number
  verified_exited?: boolean
  escalated_to_sigkill?: boolean
}

interface ProcessTreeEntry {
  pid: number
  ppid: number
  command: string
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
  const projectHash = String(namespace?.root_hash || '')
  const actions: CleanupAction[] = []
  const graceMs = opts.graceMs ?? Number(process.env.SKS_CLEANUP_GRACE_MS || 750)
  const killEscalation = opts.killEscalation !== false && process.env.SKS_CLEANUP_KILL_ESCALATION !== '0'
  const processReports = await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-process-report.json')
  for (const file of processReports) {
    const report = await readJson<any>(file, null)
    const pid = Number(report?.pid || 0)
    const sessionId = String(report?.session_id || '')
    const status = String(sessions.find((row: any) => String(row.session_id || '') === sessionId)?.status || '')
    const terminal = TERMINAL_STATUSES.has(status) || (report?.exit_code !== null && report?.exit_code !== undefined)
    if (!pid || !processIsAlive(pid)) continue
    if (activeSessionIds.has(sessionId) && !terminal) {
      actions.push({ kind: 'skip_active_session', target: sessionId || String(pid), status: 'skipped', reason: 'session_active' })
      continue
    }
    if (!processReportInNamespace(report, projectHash)) {
      actions.push({ kind: 'skip_foreign_namespace', target: String(pid), status: 'skipped', reason: 'process_outside_project_namespace' })
      continue
    }
    actions.push(await terminateProcessTreeAction({
      pid,
      reason: terminal ? 'terminal_session_process_alive' : 'stale_session_process',
      apply,
      graceMs,
      killEscalation
    }))
  }
  const tmuxReports = await listNamedFiles(path.join(agentRoot, 'sessions'), 'agent-tmux-report.json')
  for (const file of tmuxReports) {
    const report = await readJson<any>(file, null)
    const paneId = String(report?.pane_id || '')
    const sessionId = String(report?.session_id || '')
    if (!validTmuxPaneId(paneId)) continue
    if (!processReportInNamespace(report, projectHash)) {
      actions.push({ kind: 'skip_foreign_namespace', target: paneId, status: 'skipped', reason: 'tmux_pane_outside_project_namespace' })
      continue
    }
    if (activeSessionIds.has(sessionId) && opts.drain !== true) {
      actions.push({ kind: 'skip_active_session', target: sessionId || paneId, status: 'skipped', reason: 'tmux_session_active' })
      continue
    }
    actions.push(await applyAction({
      kind: 'close_tmux_pane',
      target: paneId,
      reason: 'stale_tmux_pane',
      apply,
      before: async () => ({ listed: await tmuxPaneListed(paneId), pane_id: paneId }),
      after: async () => ({ listed: await tmuxPaneListed(paneId), pane_id: paneId }),
      run: async () => {
        const { runProcess } = await import('../fsx.js')
        await runProcess('tmux', ['kill-pane', '-t', paneId], { timeoutMs: 3000, maxOutputBytes: 4096 })
        if (await tmuxPaneListed(paneId)) throw new Error('tmux_pane_still_listed_after_kill')
      }
    }))
  }
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
      before: async () => ({ exists: await exists(dir) }),
      after: async () => ({ exists: await exists(dir) }),
      run: async () => {
        await fsp.rm(dir, { recursive: true, force: true })
        if (await exists(dir)) throw new Error('temp_dir_still_exists_after_remove')
      }
    }))
  }
  for (const lock of await staleLockFiles(String(namespace?.lock_dir || ''), projectHash, now, staleMs)) {
    actions.push(await applyAction({
      kind: 'remove_lock',
      target: lock,
      reason: 'stale_lock_file',
      apply,
      before: async () => ({ exists: await exists(lock) }),
      after: async () => ({ exists: await exists(lock) }),
      run: async () => {
        await fsp.rm(lock, { force: true })
        if (await exists(lock)) throw new Error('lock_file_still_exists_after_remove')
      }
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
    process_trees: byKind('terminate_process').map((row) => ({ target: row.target, tree: row.process_tree || [] })),
    process_tree_count: byKind('terminate_process').filter((row) => (row.process_tree || []).length > 0).length,
    sigterm_planned: input.actions.filter((row) => row.status === 'planned' && row.signal_sequence?.includes('SIGTERM')).map((row) => row.target),
    sigterm_sent: input.actions.filter((row) => row.status === 'applied' && row.signal_sequence?.includes('SIGTERM')).map((row) => row.target),
    sigkill_escalations: input.actions.filter((row) => row.escalated_to_sigkill === true).map((row) => row.target),
    process_exit_verified: input.actions.filter((row) => row.kind === 'terminate_process' && row.verified_exited === true).map((row) => row.target),
    sigterm_count: input.actions.filter((row) => row.signal_sequence?.includes('SIGTERM')).length,
    sigkill_count: input.actions.filter((row) => row.signal_sequence?.includes('SIGKILL')).length,
    verified_exited_count: input.actions.filter((row) => row.kind === 'terminate_process' && row.verified_exited === true).length,
    failed_to_kill_count: input.actions.filter((row) => row.kind === 'terminate_process' && row.status === 'failed').length,
    stale_tmux_panes_found: byKind('close_tmux_pane').map((row) => row.target),
    stale_tmux_panes_closed: byKind('close_tmux_pane', 'applied').map((row) => row.target),
    tmux_panes_verified_closed: byKind('close_tmux_pane', 'applied').filter((row) => row.after?.listed === false).map((row) => row.target),
    tmux_close_failures: byKind('close_tmux_pane', 'failed').map((row) => row.target),
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

async function terminateProcessTreeAction(input: { pid: number; reason: string; apply: boolean; graceMs: number; killEscalation: boolean }): Promise<CleanupAction> {
  const processTree = await readProcessTree(input.pid)
  const targets = processTree.length ? processTree.map((row) => row.pid) : [input.pid]
  if (!input.apply) {
    return {
      kind: 'terminate_process',
      target: String(input.pid),
      status: 'planned',
      reason: input.reason,
      process_tree: processTree,
      before: { alive: targets.filter(processIsAlive) },
      after: { alive: targets.filter(processIsAlive) },
      signal_sequence: input.killEscalation ? ['SIGTERM', 'SIGKILL_IF_STILL_ALIVE'] : ['SIGTERM'],
      grace_ms: input.graceMs,
      verified_exited: false,
      escalated_to_sigkill: false
    }
  }
  const signalSequence: string[] = []
  try {
    for (const pid of [...targets].reverse()) safeKill(pid, 'SIGTERM')
    signalSequence.push('SIGTERM')
    await waitForProcessesExited(targets, input.graceMs)
    let alive = targets.filter(processIsAlive)
    let escalated = false
    if (alive.length && input.killEscalation) {
      for (const pid of [...alive].reverse()) safeKill(pid, 'SIGKILL')
      signalSequence.push('SIGKILL')
      escalated = true
      await waitForProcessesExited(targets, 500)
      alive = targets.filter(processIsAlive)
    }
    return {
      kind: 'terminate_process',
      target: String(input.pid),
      status: alive.length ? 'failed' : 'applied',
      reason: input.reason,
      process_tree: processTree,
      before: { alive: targets },
      after: { alive },
      signal_sequence: signalSequence,
      grace_ms: input.graceMs,
      verified_exited: alive.length === 0,
      escalated_to_sigkill: escalated,
      ...(alive.length ? { error: `processes_still_alive:${alive.join(',')}` } : {})
    }
  } catch (err: unknown) {
    return {
      kind: 'terminate_process',
      target: String(input.pid),
      status: 'failed',
      reason: input.reason,
      process_tree: processTree,
      before: { alive: targets },
      after: { alive: targets.filter(processIsAlive) },
      signal_sequence: signalSequence,
      grace_ms: input.graceMs,
      verified_exited: false,
      escalated_to_sigkill: signalSequence.includes('SIGKILL'),
      error: err instanceof Error ? err.message : String(err)
    }
  }
}

async function applyAction(input: { kind: CleanupActionKind; target: string; reason: string; apply: boolean; before?: () => Promise<Record<string, unknown>>; after?: () => Promise<Record<string, unknown>>; run: () => Promise<void> | void }): Promise<CleanupAction> {
  const before = input.before ? await input.before().catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })) : undefined
  if (!input.apply) return { kind: input.kind, target: input.target, status: 'planned', reason: input.reason, ...(before ? { before, after: before } : {}) }
  try {
    await input.run()
    const after = input.after ? await input.after().catch((err: unknown) => ({ error: err instanceof Error ? err.message : String(err) })) : undefined
    return { kind: input.kind, target: input.target, status: 'applied', reason: input.reason, ...(before ? { before } : {}), ...(after ? { after } : {}) }
  } catch (err: unknown) {
    const after = input.after ? await input.after().catch((afterErr: unknown) => ({ error: afterErr instanceof Error ? afterErr.message : String(afterErr) })) : undefined
    return { kind: input.kind, target: input.target, status: 'failed', reason: input.reason, error: err instanceof Error ? err.message : String(err), ...(before ? { before } : {}), ...(after ? { after } : {}) }
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

function processReportInNamespace(report: any, projectHash: string) {
  if (!projectHash) return true
  const raw = JSON.stringify({
    project_hash: report?.project_hash,
    root_hash: report?.root_hash,
    project_namespace: report?.project_namespace,
    cwd: report?.cwd,
    stdout_log: report?.stdout_log,
    stderr_log: report?.stderr_log
  })
  return raw === '{}' || raw.includes(projectHash) || (!report?.project_hash && !report?.root_hash && !report?.project_namespace)
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

async function readProcessTree(rootPid: number): Promise<ProcessTreeEntry[]> {
  try {
    const { runProcess } = await import('../fsx.js')
    const result = await runProcess('ps', ['-axo', 'pid=,ppid=,command='], { timeoutMs: 3000, maxOutputBytes: 512 * 1024 })
    const rows = result.stdout.split(/\r?\n/).map((line) => {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.+)$/)
      if (!match) return null
      return { pid: Number(match[1]), ppid: Number(match[2]), command: match[3] || '' }
    }).filter(Boolean) as ProcessTreeEntry[]
    const byParent = new Map<number, ProcessTreeEntry[]>()
    for (const row of rows) byParent.set(row.ppid, [...(byParent.get(row.ppid) || []), row])
    const out: ProcessTreeEntry[] = []
    const visit = (pid: number) => {
      const current = rows.find((row) => row.pid === pid)
      if (current && !out.some((row) => row.pid === current.pid)) out.push(current)
      for (const child of byParent.get(pid) || []) visit(child.pid)
    }
    visit(rootPid)
    return out
  } catch {
    return processIsAlive(rootPid) ? [{ pid: rootPid, ppid: 0, command: 'unknown' }] : []
  }
}

function safeKill(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal)
  } catch {}
}

async function waitForProcessesExited(pids: number[], timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (!pids.some(processIsAlive)) return true
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  return !pids.some(processIsAlive)
}

function validTmuxPaneId(value: string) {
  return /^%\d+$/.test(value)
}

async function tmuxPaneListed(paneId: string) {
  try {
    const { runProcess } = await import('../fsx.js')
    const listed = await runProcess('tmux', ['list-panes', '-a', '-F', '#{pane_id}'], { timeoutMs: 3000, maxOutputBytes: 4096 })
    return listed.stdout.split(/\r?\n/).includes(paneId)
  } catch {
    return false
  }
}

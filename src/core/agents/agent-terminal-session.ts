import path from 'node:path'
import { ensureDir, nowIso, readJson, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { appendAgentLedgerEvent } from './agent-central-ledger.js'

export const AGENT_TERMINAL_SESSION_SCHEMA = 'sks.agent-terminal-session.v1'
export const AGENT_TERMINAL_CLOSE_REPORT_SCHEMA = 'sks.agent-terminal-close-report.v1'

export interface AgentTerminalSessionRecord {
  schema: typeof AGENT_TERMINAL_SESSION_SCHEMA
  agent_id: string
  session_id: string
  slot_id: string | null
  generation_index: number | null
  terminal_session_id: string
  terminal_backend: string
  terminal_transcript_path: string
  terminal_stdout_path: string
  terminal_stderr_path: string
  terminal_started_at: string
  terminal_closed_at: string | null
  terminal_exit_code: number | null
  real: boolean
  status: 'running' | 'closed'
}

export async function startAgentTerminalSession(
  root: string,
  agent: any,
  opts: { backend?: string; real?: boolean; slotId?: string; generationIndex?: number; requireGeneration?: boolean } = {}
): Promise<AgentTerminalSessionRecord> {
  assertGenerationAddress(agent, opts)
  const relDir = terminalSessionRelDir(agent, opts)
  const sessionDir = path.join(root, relDir)
  await ensureDir(sessionDir)
  const slotId = opts.slotId || agent.slot_id || agent.worker_slot_id || null
  const generationIndex = Number.isFinite(Number(opts.generationIndex ?? agent.generation_index)) ? Number(opts.generationIndex ?? agent.generation_index) : null
  const record: AgentTerminalSessionRecord = {
    schema: AGENT_TERMINAL_SESSION_SCHEMA,
    agent_id: String(agent.id),
    session_id: String(agent.session_id || agent.id),
    slot_id: slotId ? String(slotId) : null,
    generation_index: generationIndex,
    terminal_session_id: `${String(agent.session_id || agent.id)}-terminal`,
    terminal_backend: String(opts.backend || 'fake'),
    terminal_transcript_path: path.join(relDir, 'terminal-transcript.log'),
    terminal_stdout_path: path.join(relDir, 'terminal-stdout.log'),
    terminal_stderr_path: path.join(relDir, 'terminal-stderr.log'),
    terminal_started_at: nowIso(),
    terminal_closed_at: null,
    terminal_exit_code: null,
    real: opts.real === true,
    status: 'running'
  }
  await writeTextAtomic(path.join(root, record.terminal_transcript_path), `agent ${agent.id} terminal opened (${record.terminal_backend})\n`)
  await writeTextAtomic(path.join(root, record.terminal_stdout_path), '')
  await writeTextAtomic(path.join(root, record.terminal_stderr_path), '')
  await writeJsonAtomic(path.join(sessionDir, 'agent-terminal-session.json'), record)
  await appendAgentLedgerEvent(root, { agent_id: record.agent_id, session_id: record.session_id, event_type: 'terminal_session_started', payload: record })
  return record
}

export async function closeAgentTerminalSession(
  root: string,
  agent: any,
  opts: { exitCode?: number | null; status?: string; stdoutTail?: string; stderrTail?: string; slotId?: string; generationIndex?: number; requireGeneration?: boolean } = {}
) {
  assertGenerationAddress(agent, opts)
  const relDir = terminalSessionRelDir(agent, opts)
  const sessionDir = path.join(root, relDir)
  const file = path.join(sessionDir, 'agent-terminal-session.json')
  const current = await readJson<AgentTerminalSessionRecord>(file, null as any)
  const closedAt = nowIso()
  const next: AgentTerminalSessionRecord = {
    ...(current || await startAgentTerminalSession(root, agent, {
      backend: 'unknown',
      real: false,
      ...(opts.slotId ? { slotId: opts.slotId } : {}),
      ...(opts.generationIndex === undefined ? {} : { generationIndex: opts.generationIndex })
    })),
    terminal_closed_at: closedAt,
    terminal_exit_code: opts.exitCode ?? 0,
    status: 'closed'
  }
  if (opts.stdoutTail) await writeTextAtomic(path.join(root, next.terminal_stdout_path), opts.stdoutTail)
  if (opts.stderrTail) await writeTextAtomic(path.join(root, next.terminal_stderr_path), opts.stderrTail)
  await writeTextAtomic(path.join(root, next.terminal_transcript_path), [
    `agent ${agent.id} terminal opened (${next.terminal_backend})`,
    `agent ${agent.id} terminal closed status=${opts.status || 'closed'} exit=${next.terminal_exit_code}`,
    ''
  ].join('\n'))
  await writeJsonAtomic(file, next)
  const report = {
    schema: AGENT_TERMINAL_CLOSE_REPORT_SCHEMA,
    generated_at: closedAt,
    agent_id: next.agent_id,
    session_id: next.session_id,
    terminal_session_id: next.terminal_session_id,
    terminal_backend: next.terminal_backend,
    terminal_started_at: next.terminal_started_at,
    terminal_closed_at: next.terminal_closed_at,
    terminal_exit_code: next.terminal_exit_code,
    real: next.real,
    transcript: next.terminal_transcript_path,
    stdout: next.terminal_stdout_path,
    stderr: next.terminal_stderr_path,
    ok: true
  }
  await writeJsonAtomic(path.join(sessionDir, 'agent-terminal-close-report.json'), report)
  await appendAgentLedgerEvent(root, { agent_id: next.agent_id, session_id: next.session_id, event_type: 'terminal_session_closed', payload: report })
  return report
}

export async function assertAgentTerminalSessionsClosed(root: string) {
  const generationAggregate = await readJson<any>(path.join(root, 'agent-session-generations.json'), null)
  if (generationAggregate?.generations) return assertGenerationTerminalSessionsClosed(root, generationAggregate)
  const sessions = await readJson<any>(path.join(root, 'agent-sessions.json'), { sessions: {} })
  const rows = Object.values<any>(sessions.sessions || {})
  const missing: string[] = []
  const open: string[] = []
  const reports: string[] = []
  for (const row of rows) {
    const agentId = String(row.agent_id || row.id || '')
    if (!agentId) continue
    const relDir = terminalSessionRelDir({ id: agentId, ...row }, {})
    const sessionFile = path.join(root, relDir, 'agent-terminal-session.json')
    const reportFile = path.join(root, relDir, 'agent-terminal-close-report.json')
    const terminal = await readJson<any>(sessionFile, null)
    const report = await readJson<any>(reportFile, null)
    if (!terminal) missing.push(agentId)
    else if (!terminal.terminal_closed_at || terminal.status !== 'closed') open.push(agentId)
    if (!report?.ok) reports.push(agentId)
  }
  return {
    schema: 'sks.agent-terminal-session-closure.v1',
    ok: rows.length > 0 && missing.length === 0 && open.length === 0 && reports.length === 0,
    total_sessions: rows.length,
    missing_terminal_sessions: missing,
    open_terminal_sessions: open,
    missing_close_reports: reports,
    blockers: [
      ...missing.map((id) => `terminal_missing:${id}`),
      ...open.map((id) => `terminal_not_closed:${id}`),
      ...reports.map((id) => `terminal_close_report_missing:${id}`)
    ]
  }
}

async function assertGenerationTerminalSessionsClosed(root: string, aggregate: any) {
  const rows = Object.values<any>(aggregate.generations || {})
  const missing: string[] = []
  const open: string[] = []
  const reports: string[] = []
  for (const row of rows) {
    const sessionId = String(row.session_id || '')
    const relDir = String(row.artifact_dir || terminalSessionRelDir({ session_id: sessionId, slot_id: row.slot_id, generation_index: row.generation_index }, {}))
    const sessionFile = path.join(root, relDir, 'agent-terminal-session.json')
    const reportFile = path.join(root, relDir, 'agent-terminal-close-report.json')
    const terminal = await readJson<any>(sessionFile, null)
    const report = await readJson<any>(reportFile, null)
    if (!terminal) missing.push(sessionId)
    else if (!terminal.terminal_closed_at || terminal.status !== 'closed') open.push(sessionId)
    if (!report?.ok) reports.push(sessionId)
  }
  return {
    schema: 'sks.agent-terminal-session-closure.v1',
    ok: rows.length > 0 && missing.length === 0 && open.length === 0 && reports.length === 0,
    total_sessions: rows.length,
    generation_terminal_count: rows.length,
    missing_terminal_sessions: missing,
    open_terminal_sessions: open,
    missing_close_reports: reports,
    blockers: [
      ...missing.map((id) => `terminal_missing:${id}`),
      ...open.map((id) => `terminal_not_closed:${id}`),
      ...reports.map((id) => `terminal_close_report_missing:${id}`)
    ]
  }
}

export function terminalSessionRelDir(agent: any, opts: { slotId?: string; generationIndex?: number } = {}) {
  const explicitDir = agent.session_artifact_dir || agent.artifact_dir
  if (explicitDir) return String(explicitDir)
  const slotId = opts.slotId || agent.slot_id || agent.worker_slot_id
  const generationIndex = opts.generationIndex ?? agent.generation_index
  if (slotId && Number.isFinite(Number(generationIndex))) {
    return path.join('sessions', String(slotId), `gen-${Number(generationIndex)}`)
  }
  return path.join('sessions', String(agent.id || agent.agent_id || 'agent'))
}

function assertGenerationAddress(agent: any, opts: { slotId?: string; generationIndex?: number; requireGeneration?: boolean } = {}) {
  if (!opts.requireGeneration) return
  const slotId = opts.slotId || agent.slot_id || agent.worker_slot_id
  const generationIndex = opts.generationIndex ?? agent.generation_index
  if (!slotId || !Number.isFinite(Number(generationIndex))) {
    throw new Error('scheduler terminal session requires slotId and generationIndex')
  }
}

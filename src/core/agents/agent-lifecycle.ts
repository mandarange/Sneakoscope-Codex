import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { appendAgentLedgerEvent } from './agent-central-ledger.js'

export const AGENT_LIFECYCLE_STATES = Object.freeze(['planned', 'launching', 'running', 'heartbeat_missing', 'collecting', 'completed', 'failed', 'timed_out', 'closing', 'closed', 'killed'])
export const AGENT_HEARTBEAT_INTERVAL_MS = 5000
export const AGENT_HEARTBEAT_TIMEOUT_MS = 60000
export const AGENT_HARD_TIMEOUT_MS = 30 * 60 * 1000

const SESSION_LOCKS = new Map<string, Promise<unknown>>()

async function withSessionLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = SESSION_LOCKS.get(root) || Promise.resolve()
  const next = previous.catch(() => undefined).then(fn)
  SESSION_LOCKS.set(root, next.catch(() => undefined))
  return next
}

export async function openAgentSession(root: string, agent: any) {
  await updateSession(root, agent, { status: 'launching', opened_at: nowIso(), heartbeat_at: nowIso() }, 'session_launching', agent.session_id)
  return updateSession(root, agent, { status: 'running', heartbeat_at: nowIso() }, 'session_opened', agent.session_id)
}

export async function heartbeatAgentSession(root: string, agent: any) {
  return updateSession(root, agent, { heartbeat_at: nowIso() }, 'heartbeat', agent.session_id)
}

export async function collectAgentSession(root: string, agent: any) {
  return updateSession(root, agent, { status: 'collecting', heartbeat_at: nowIso() }, 'session_collecting', agent.session_id)
}

export async function completeAgentSession(root: string, agent: any) {
  return updateSession(root, agent, { status: 'completed', heartbeat_at: nowIso() }, 'session_completed', agent.session_id)
}

export async function closeAgentSession(root: string, agent: any, status = 'closed') {
  await updateSession(root, agent, { status: status === 'closed' ? 'closing' : status, heartbeat_at: nowIso() }, 'session_closing', agent.session_id)
  return updateSession(root, agent, { status, closed_at: nowIso(), heartbeat_at: nowIso() }, 'session_closed', agent.session_id)
}

export async function assertAllAgentSessionsClosed(root: string) {
  const sessions = await readJson<any>(path.join(root, 'agent-sessions.json'), { sessions: {} })
  const rows = Object.values<any>(sessions.sessions || {})
  const open = rows.filter((session) => !['closed', 'blocked', 'failed', 'killed', 'timed_out'].includes(String(session.status)))
  const closed = rows.filter((session) => String(session.status) === 'closed')
  return {
    ok: open.length === 0 && rows.length > 0 && closed.length === rows.length,
    open_sessions: open.map((session) => session.session_id || session.agent_id),
    launched_count: rows.filter((session) => Boolean(session.opened_at)).length,
    closed_session_count: closed.length,
    total_sessions: rows.length,
    blocks_proof: open.length > 0
  }
}

export async function writeAgentLifecyclePolicy(root: string) {
  const policy = {
    schema: 'sks.agent-lifecycle-policy.v1',
    states: AGENT_LIFECYCLE_STATES,
    heartbeat_interval_ms: AGENT_HEARTBEAT_INTERVAL_MS,
    heartbeat_timeout_ms: AGENT_HEARTBEAT_TIMEOUT_MS,
    hard_timeout_ms: agentHardTimeoutMs()
  }
  await writeJsonAtomic(path.join(root, 'agent-lifecycle-policy.json'), policy)
  return policy
}

export async function writeAgentLifecycleAggregate(root: string) {
  const sessions = await readJson<any>(path.join(root, 'agent-sessions.json'), { sessions: {} })
  const rows = Object.values<any>(sessions.sessions || {})
  const aggregate = {
    schema: 'sks.agent-lifecycle-aggregate.v1',
    updated_at: nowIso(),
    states: Object.fromEntries(AGENT_LIFECYCLE_STATES.map((state) => [state, rows.filter((session) => String(session.status) === state).length])),
    total_sessions: rows.length,
    closed_session_count: rows.filter((session) => String(session.status) === 'closed').length
  }
  await writeJsonAtomic(path.join(root, 'agent-lifecycle-aggregate.json'), aggregate)
  await writeJsonAtomic(path.join(root, 'agent-lifecycle.json'), {
    schema: 'sks.agent-lifecycle.v1',
    aggregate,
    all_sessions_closed: rows.length > 0 && aggregate.closed_session_count === rows.length
  })
  return aggregate
}

export async function detectStaleAgentSessions(root: string, now = Date.now()) {
  const sessions = await readJson<any>(path.join(root, 'agent-sessions.json'), { sessions: {} })
  const stale = Object.values<any>(sessions.sessions || {}).filter((session) => {
    if (['closed', 'blocked', 'failed', 'killed', 'timed_out'].includes(String(session.status))) return false
    const heartbeat = Date.parse(String(session.heartbeat_at || session.opened_at || ''))
    return Number.isFinite(heartbeat) && now - heartbeat > AGENT_HEARTBEAT_TIMEOUT_MS
  })
  return { ok: stale.length === 0, stale_sessions: stale.map((session) => session.session_id || session.agent_id) }
}

export function agentHardTimeoutMs(env: any = process.env) {
  const raw = Number.parseInt(String(env.SKS_AGENT_HARD_TIMEOUT_MS || ''), 10)
  if (!Number.isFinite(raw) || raw <= 0) return AGENT_HARD_TIMEOUT_MS
  return Math.max(1000, Math.min(raw, 24 * 60 * 60 * 1000))
}

export async function killTimedOutAgentSessions(root: string, now = Date.now(), opts: any = {}) {
  return withSessionLock(root, async () => {
    const hardTimeoutMs = opts.hardTimeoutMs || agentHardTimeoutMs(opts.env)
    const file = path.join(root, 'agent-sessions.json')
    const data = await readJson<any>(file, { schema: 'sks.agent-sessions.v1', sessions: {} })
    const killed: string[] = []
    for (const [sessionKey, session] of Object.entries<any>(data.sessions || {})) {
      if (['closed', 'blocked', 'failed', 'killed', 'timed_out'].includes(String(session.status))) continue
      const opened = Date.parse(String(session.opened_at || ''))
      const heartbeat = Date.parse(String(session.heartbeat_at || session.opened_at || ''))
      const hardTimedOut = Number.isFinite(opened) && now - opened > hardTimeoutMs
      const heartbeatTimedOut = Number.isFinite(heartbeat) && now - heartbeat > AGENT_HEARTBEAT_TIMEOUT_MS
      if (!hardTimedOut && !heartbeatTimedOut) continue
      const sessionId = session.session_id || sessionKey
      data.sessions[sessionKey] = {
        ...session,
        status: 'killed',
        killed_at: new Date(now).toISOString(),
        closed_at: new Date(now).toISOString(),
        heartbeat_at: new Date(now).toISOString(),
        kill_reason: hardTimedOut ? 'hard_timeout' : 'heartbeat_timeout'
      }
      await writeSessionRecord(root, data.sessions[sessionKey])
      await appendAgentLedgerEvent(root, { agent_id: String(session.agent_id || sessionKey), session_id: sessionId, event_type: 'session_killed_timeout', payload: { kill_reason: data.sessions[sessionKey].kill_reason } })
      killed.push(sessionId)
    }
    await writeJsonAtomic(file, data)
    await writeAgentLifecycleAggregate(root)
    const report = {
      schema: 'sks.agent-timeout-kill-report.v1',
      generated_at: nowIso(),
      hard_timeout_ms: hardTimeoutMs,
      ok: killed.length === 0,
      killed_sessions: killed
    }
    await writeJsonAtomic(path.join(root, 'agent-timeout-kill-report.json'), report)
    return report
  })
}

async function updateSession(root: string, agent: any, patch: any, eventType: string, sessionId: string) {
  return withSessionLock(root, async () => {
  const file = path.join(root, 'agent-sessions.json')
  const data = await readJson<any>(file, { schema: 'sks.agent-sessions.v1', sessions: {} })
  data.sessions = data.sessions || {}
  const agentId = String(agent.id || agent.agent_id || sessionId)
  const sessionKey = String(agent.session_generation_id || agent.session_id || agentId)
  data.sessions[sessionKey] = {
    ...(data.sessions[sessionKey] || {
      agent_id: agentId,
      slot_id: agent.slot_id || agent.worker_slot_id || null,
      generation_index: Number.isFinite(Number(agent.generation_index)) ? Number(agent.generation_index) : null,
      session_artifact_dir: agent.session_artifact_dir || null,
      session_id: sessionId
    }),
    agent_id: agentId,
    slot_id: agent.slot_id || agent.worker_slot_id || data.sessions[sessionKey]?.slot_id || null,
    generation_index: Number.isFinite(Number(agent.generation_index)) ? Number(agent.generation_index) : data.sessions[sessionKey]?.generation_index ?? null,
    session_artifact_dir: agent.session_artifact_dir || data.sessions[sessionKey]?.session_artifact_dir || null,
    session_id: sessionId,
    ...patch
  }
  await writeJsonAtomic(file, data)
  await writeSessionRecord(root, data.sessions[sessionKey])
  await writeAgentLifecycleAggregate(root)
  await appendAgentLedgerEvent(root, { agent_id: agentId, session_id: sessionId, event_type: eventType, payload: patch })
  return data.sessions[sessionKey]
  })
}

async function writeSessionRecord(root: string, session: any) {
  const artifactDir = session.session_artifact_dir
  if (artifactDir) {
    await writeJsonAtomic(path.join(root, artifactDir, 'agent-session-record.json'), { schema: 'sks.agent-session-record.v1', ...session })
    return
  }
  await writeJsonAtomic(path.join(root, 'sessions', String(session.agent_id || session.session_id) + '.json'), { schema: 'sks.agent-session-record.v1', ...session })
}

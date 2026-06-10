import path from 'node:path'
import fs from 'node:fs/promises'
import { appendJsonl, nowIso } from '../fsx.js'
import { appendAgentLedgerEvent } from './agent-central-ledger.js'

export interface AgentMessageBusEntry {
  schema: 'sks.agent-message.v1'
  ts: string
  mission_id: string
  worker_id: string
  slot_id?: string | null
  session_id?: string | null
  level: 'info' | 'warning' | 'error'
  event_type: 'worker_completed' | 'worker_failed' | 'blocker' | 'handoff' | 'status'
  message: string
  artifact_paths: string[]
  from?: string | undefined
  to?: string | undefined
  type?: string | undefined
  body?: string | undefined
}

export async function appendAgentMessage(root: string, message: {
  from: string
  session_id: string
  to?: string
  body: string
  type?: string
  mission_id?: string
  worker_id?: string
  slot_id?: string | null
  level?: AgentMessageBusEntry['level']
  event_type?: AgentMessageBusEntry['event_type']
  artifact_paths?: string[]
}) {
  const eventType = normalizeAgentMessageEventType(message.event_type || message.type)
  const entry = {
    schema: 'sks.agent-message.v1',
    ts: nowIso(),
    mission_id: message.mission_id || inferMissionIdFromAgentRoot(root),
    worker_id: message.worker_id || message.from,
    slot_id: message.slot_id ?? message.from ?? null,
    session_id: message.session_id || null,
    level: message.level || (eventType === 'worker_failed' || eventType === 'blocker' ? 'error' : 'info'),
    event_type: eventType,
    message: message.body,
    artifact_paths: message.artifact_paths || [],
    from: message.from,
    to: message.to || 'orchestrator',
    type: message.type || 'note',
    body: message.body
  } satisfies AgentMessageBusEntry
  await appendJsonl(path.join(root, 'agent-messages.jsonl'), entry)
  await appendAgentLedgerEvent(root, { agent_id: message.from, session_id: message.session_id, event_type: 'message_appended', payload: { to: entry.to, type: entry.type } })
  return entry
}

export async function readAgentMessageBus(root: string, missionId: string, opts: {
  max?: number
  levels?: string[]
} = {}): Promise<AgentMessageBusEntry[]> {
  const file = agentMessageBusPath(root, missionId)
  let text = ''
  try {
    text = await fs.readFile(file, 'utf8')
  } catch {
    return []
  }
  const levels = new Set((opts.levels || []).map((level) => String(level)))
  const rows = text.split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return normalizeAgentMessageBusEntry(JSON.parse(line), missionId)
      } catch {
        return null
      }
    })
    .filter((row): row is AgentMessageBusEntry => Boolean(row))
    .filter((row) => !levels.size || levels.has(row.level))
  const max = Math.max(0, Math.floor(Number(opts.max || rows.length)))
  return max > 0 ? rows.slice(-max) : rows
}

export function agentMessageBusPath(root: string, missionId: string): string {
  const resolved = path.resolve(root)
  if (path.basename(resolved) === 'agents') return path.join(resolved, 'agent-messages.jsonl')
  if (path.basename(resolved) === missionId) return path.join(resolved, 'agents', 'agent-messages.jsonl')
  return path.join(resolved, '.sneakoscope', 'missions', missionId, 'agents', 'agent-messages.jsonl')
}

function normalizeAgentMessageBusEntry(value: any, missionId: string): AgentMessageBusEntry {
  const eventType = normalizeAgentMessageEventType(value.event_type || value.type)
  return {
    schema: 'sks.agent-message.v1',
    ts: String(value.ts || value.generated_at || nowIso()),
    mission_id: String(value.mission_id || missionId),
    worker_id: String(value.worker_id || value.from || value.slot_id || 'worker'),
    slot_id: value.slot_id == null ? value.from == null ? null : String(value.from) : String(value.slot_id),
    session_id: value.session_id == null ? null : String(value.session_id),
    level: normalizeAgentMessageLevel(value.level, eventType),
    event_type: eventType,
    message: String(value.message || value.body || ''),
    artifact_paths: Array.isArray(value.artifact_paths) ? value.artifact_paths.map(String) : [],
    from: value.from == null ? undefined : String(value.from),
    to: value.to == null ? undefined : String(value.to),
    type: value.type == null ? undefined : String(value.type),
    body: value.body == null ? undefined : String(value.body)
  }
}

function normalizeAgentMessageEventType(value: unknown): AgentMessageBusEntry['event_type'] {
  const text = String(value || '').toLowerCase()
  if (text === 'worker_completed' || text === 'completed' || text === 'done') return 'worker_completed'
  if (text === 'worker_failed' || text === 'failed' || text === 'error') return 'worker_failed'
  if (text === 'blocker') return 'blocker'
  if (text === 'handoff') return 'handoff'
  return 'status'
}

function normalizeAgentMessageLevel(value: unknown, eventType: AgentMessageBusEntry['event_type']): AgentMessageBusEntry['level'] {
  const text = String(value || '').toLowerCase()
  if (text === 'info' || text === 'warning' || text === 'error') return text
  if (eventType === 'worker_failed' || eventType === 'blocker') return 'error'
  return 'info'
}

function inferMissionIdFromAgentRoot(root: string): string {
  const resolved = path.resolve(root)
  return path.basename(resolved) === 'agents' ? path.basename(path.dirname(resolved)) : 'unknown'
}

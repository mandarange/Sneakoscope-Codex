import path from 'node:path'
import fs from 'node:fs/promises'
import { appendJsonl, nowIso, sha256 } from '../fsx.js'
import { appendAgentLedgerEvent } from './agent-central-ledger.js'

export const SIBLING_MESSAGE_MAX_BYTES = 4_096
export const SIBLING_MESSAGE_MAX_COUNT = 8
export const SIBLING_MESSAGE_MAX_REPLIES = 4
export const SIBLING_MESSAGE_MAX_TTL_MS = 300_000
export const SIBLING_MESSAGE_MAX_HOPS = 1 as const

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
  message_id?: string | undefined
  plan_id?: string | undefined
  correlation_task_key?: string | undefined
  reply_to?: string | null | undefined
  expires_at?: string | undefined
  hop_count?: number | undefined
  body_digest?: string | undefined
}

export const SIBLING_MESSAGE_KINDS = Object.freeze(['need_sibling_analysis', 'evidence_request', 'handoff_clarification', 'conflict_notice'] as const)
export type SiblingMessageKind = typeof SIBLING_MESSAGE_KINDS[number]

export interface SiblingMessageInput {
  message_id: string
  sender_task_id: string
  recipient_task_id: string
  mission_id: string
  plan_id: string
  correlation_task_key: string
  kind: SiblingMessageKind
  body: string
  artifact_refs?: readonly string[]
  reply_to?: string | null
  created_at?: string
  expires_at?: string
  hop_count?: number
}

export interface SiblingRelayOptions {
  /** The parent plan is the relay's authority boundary. */
  planId?: string
  parentTaskId?: string | null
  senderParentTaskId?: string | null
  recipientParentTaskId?: string | null
  allowedRecipients?: readonly string[]
  /** Capability claims are already resolved by the parent gate. */
  senderCapabilities?: readonly string[]
  recipientCapabilities?: readonly string[]
  requiredCapability?: string
  maxBytes?: number
  maxCount?: number
  maxReplies?: number
  maxTtlMs?: number
  now?: number
  mainTaskId?: string
}

const SIBLING_RELAY_LOCKS = new Map<string, Promise<unknown>>()

async function withSiblingRelayLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = SIBLING_RELAY_LOCKS.get(root) || Promise.resolve()
  const next = previous.catch(() => undefined).then(fn)
  SIBLING_RELAY_LOCKS.set(root, next.catch(() => undefined))
  return next
}

export function buildSiblingMessage(input: SiblingMessageInput) {
  const created = input.created_at || nowIso()
  const expires = input.expires_at || new Date(Date.parse(created) + 120_000).toISOString()
  const body = String(input.body || '').trim()
  const bodyBytes = Buffer.byteLength(body, 'utf8')
  if (bodyBytes === 0 || bodyBytes > SIBLING_MESSAGE_MAX_BYTES) throw new Error('sibling_message_body_size')
  if (/(?:spawn|merge|publish|align|apply|permission|elevat|credential|secret|api[ _-]?key|password|token|session.?id)/i.test(body)) {
    throw new Error('sibling_message_action_or_sensitive_content')
  }
  const ttlMs = Date.parse(expires) - Date.parse(created)
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || ttlMs > SIBLING_MESSAGE_MAX_TTL_MS) throw new Error('sibling_message_ttl')
  const message = {
    schema: 'sks.sibling-message.v1' as const,
    message_id: String(input.message_id),
    sender_task_id: String(input.sender_task_id),
    recipient_task_id: String(input.recipient_task_id),
    mission_id: String(input.mission_id),
    plan_id: String(input.plan_id),
    correlation_task_key: String(input.correlation_task_key),
    kind: input.kind,
    body_digest: sha256(body),
    artifact_refs: [...new Set((input.artifact_refs || []).map(String))].filter((ref) => !ref.includes('..') && !/[\\\0]/.test(ref)).slice(0, 16),
    reply_to: input.reply_to || null,
    created_at: created,
    expires_at: expires,
    hop_count: Math.max(0, Math.floor(input.hop_count || 0)),
    status: 'pending' as const
  }
  const validation = validateSiblingMessage(message)
  if (!validation.ok) throw new Error(`sibling_message_invalid:${validation.issues.join('|')}`)
  return message
}

export function validateSiblingMessage(value: unknown, now = Date.now(), options: {
  expectedPlanId?: string
  allowedRecipients?: readonly string[]
  maxBytes?: number
  maxTtlMs?: number
  mainTaskId?: string
} = {}) {
  const row = value as any
  const issues: string[] = []
  if (!row || row.schema !== 'sks.sibling-message.v1') issues.push('schema')
  for (const key of ['message_id', 'sender_task_id', 'recipient_task_id', 'mission_id', 'plan_id', 'correlation_task_key', 'body_digest']) if (!/^[A-Za-z0-9_.:-]{1,128}$/.test(String(row?.[key] || ''))) issues.push(key)
  if (!SIBLING_MESSAGE_KINDS.includes(row?.kind)) issues.push('kind')
  if (!Array.isArray(row?.artifact_refs) || row.artifact_refs.length > 16) issues.push('artifact_refs')
  if (Number(row?.hop_count) !== 0 && Number(row?.hop_count) !== SIBLING_MESSAGE_MAX_HOPS) issues.push('hop_count')
  if (!Number.isFinite(Date.parse(String(row?.created_at || ''))) || !Number.isFinite(Date.parse(String(row?.expires_at || '')))) issues.push('time')
  const ttlMs = Date.parse(String(row?.expires_at || '')) - Date.parse(String(row?.created_at || ''))
  if (Date.parse(String(row?.expires_at || '')) <= now) issues.push('expired')
  if (ttlMs <= 0 || ttlMs > (options.maxTtlMs || SIBLING_MESSAGE_MAX_TTL_MS)) issues.push('ttl')
  if (options.expectedPlanId && row?.plan_id !== options.expectedPlanId) issues.push('cross_plan')
  if (options.allowedRecipients && !options.allowedRecipients.includes(String(row?.recipient_task_id || ''))) issues.push('recipient')
  if (options.mainTaskId && row?.kind === 'need_sibling_analysis' && row?.recipient_task_id !== options.mainTaskId) issues.push('decomposition_recipient')
  if (typeof row?.status !== 'string' || !['pending', 'replied', 'resolved', 'denied', 'expired'].includes(row.status)) issues.push('status')
  return { ok: issues.length === 0, issues }
}

/** Sibling relay stores a digest and artifact references only; it cannot grant
 * capabilities or request spawn/apply/publish actions. */
export async function appendSiblingMessage(root: string, input: SiblingMessageInput, options: SiblingRelayOptions = {}) {
  return withSiblingRelayLock(root, async () => {
    const row = buildSiblingMessage(input)
    const now = options.now || Date.now()
    if (options.maxBytes !== undefined && Buffer.byteLength(String(input.body || '').trim(), 'utf8') > Math.min(SIBLING_MESSAGE_MAX_BYTES, Math.max(1, Math.floor(options.maxBytes)))) throw new Error('sibling_message_size_cap')
    if (row.sender_task_id === row.recipient_task_id) throw new Error('sibling_message_self_recipient')
    if (options.planId && row.plan_id !== options.planId) throw new Error('sibling_message_cross_plan')
    if (options.parentTaskId && (options.senderParentTaskId !== options.parentTaskId || options.recipientParentTaskId !== options.parentTaskId)) {
      throw new Error('sibling_message_parent_scope')
    }
    const allowedRecipients = options.allowedRecipients ? [...new Set(options.allowedRecipients.map(String))] : null
    if (allowedRecipients && !allowedRecipients.includes(row.recipient_task_id)) throw new Error('sibling_message_recipient_denied')
    if (options.mainTaskId && row.kind === 'need_sibling_analysis' && row.recipient_task_id !== options.mainTaskId) throw new Error('sibling_message_decomposition_main_only')
    const requiredCapability = options.requiredCapability || 'sibling_discussion'
    for (const side of [options.senderCapabilities, options.recipientCapabilities]) {
      if (side && !side.includes(requiredCapability)) throw new Error('sibling_message_capability_denied')
    }
    const validation = validateSiblingMessage(row, now, {
      ...(options.planId === undefined ? {} : { expectedPlanId: options.planId }),
      ...(allowedRecipients === null ? {} : { allowedRecipients }),
      ...(options.maxTtlMs === undefined ? {} : { maxTtlMs: options.maxTtlMs }),
      ...(options.mainTaskId === undefined ? {} : { mainTaskId: options.mainTaskId })
    })
    if (!validation.ok) throw new Error(`sibling_message_invalid:${validation.issues.join('|')}`)
    const existing = await readRawAgentMessages(root)
    const duplicate = existing.find((entry: any) => entry?.message_id === row.message_id && entry?.plan_id === row.plan_id)
    if (duplicate) return { ...row, duplicate: true, bus_entry: normalizeAgentMessageBusEntry(duplicate, row.mission_id) }
    const planCount = existing.filter((entry: any) => entry?.plan_id === row.plan_id && entry?.mission_id === row.mission_id).length
    if (planCount >= Math.min(SIBLING_MESSAGE_MAX_COUNT, Math.max(1, Math.floor(options.maxCount || SIBLING_MESSAGE_MAX_COUNT)))) throw new Error('sibling_message_count_cap')
    if (row.reply_to) {
      const parent = existing.find((entry: any) => entry?.message_id === row.reply_to && entry?.plan_id === row.plan_id)
      if (!parent) throw new Error('sibling_message_reply_target_missing')
      const replies = existing.filter((entry: any) => entry?.plan_id === row.plan_id && entry?.reply_to === row.reply_to).length
      if (replies >= Math.min(SIBLING_MESSAGE_MAX_REPLIES, Math.max(1, Math.floor(options.maxReplies || SIBLING_MESSAGE_MAX_REPLIES)))) throw new Error('sibling_message_reply_cap')
    }
    const entry = await appendAgentMessage(root, {
      from: row.sender_task_id,
      session_id: row.sender_task_id,
      to: row.recipient_task_id,
      body: `body_digest:${row.body_digest}`,
      type: row.kind,
      mission_id: row.mission_id,
      worker_id: row.sender_task_id,
      event_type: 'status',
      artifact_paths: row.artifact_refs,
      message_id: row.message_id,
      plan_id: row.plan_id,
      correlation_task_key: row.correlation_task_key,
      reply_to: row.reply_to,
      expires_at: row.expires_at,
      hop_count: row.hop_count,
      body_digest: row.body_digest
    })
    return { ...row, duplicate: false, bus_entry: entry }
  })
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
  message_id?: string
  plan_id?: string
  correlation_task_key?: string
  reply_to?: string | null
  expires_at?: string
  hop_count?: number
  body_digest?: string
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
    body: message.body,
    ...(message.message_id === undefined ? {} : { message_id: message.message_id }),
    ...(message.plan_id === undefined ? {} : { plan_id: message.plan_id }),
    ...(message.correlation_task_key === undefined ? {} : { correlation_task_key: message.correlation_task_key }),
    ...(message.reply_to === undefined ? {} : { reply_to: message.reply_to }),
    ...(message.expires_at === undefined ? {} : { expires_at: message.expires_at }),
    ...(message.hop_count === undefined ? {} : { hop_count: message.hop_count }),
    ...(message.body_digest === undefined ? {} : { body_digest: message.body_digest })
  } satisfies AgentMessageBusEntry
  await appendJsonl(path.join(root, 'agent-messages.jsonl'), entry)
  await appendAgentLedgerEvent(root, { agent_id: message.from, session_id: message.session_id, event_type: 'message_appended', payload: {
    to: entry.to, type: entry.type, message_id: entry.message_id || null, plan_id: entry.plan_id || null,
    correlation_task_key: entry.correlation_task_key || null, reply_to: entry.reply_to || null,
    expires_at: entry.expires_at || null, hop_count: entry.hop_count ?? null, body_digest: entry.body_digest || null
  } })
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
    body: value.body == null ? undefined : String(value.body),
    message_id: value.message_id == null ? undefined : String(value.message_id),
    plan_id: value.plan_id == null ? undefined : String(value.plan_id),
    correlation_task_key: value.correlation_task_key == null ? undefined : String(value.correlation_task_key),
    reply_to: value.reply_to == null ? value.reply_to : String(value.reply_to),
    expires_at: value.expires_at == null ? undefined : String(value.expires_at),
    hop_count: value.hop_count == null ? undefined : Number(value.hop_count),
    body_digest: value.body_digest == null ? undefined : String(value.body_digest)
  }
}

async function readRawAgentMessages(root: string): Promise<any[]> {
  const file = path.join(root, 'agent-messages.jsonl')
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  return text.split(/\n+/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)] } catch { return [] }
  })
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

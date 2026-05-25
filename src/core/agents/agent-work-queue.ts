import path from 'node:path'
import { appendJsonl, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const AGENT_WORK_QUEUE_SCHEMA = 'sks.agent-work-queue.v1'
export const AGENT_WORK_QUEUE_EVENT_SCHEMA = 'sks.agent-work-queue-event.v1'

export type AgentWorkItemStatus = 'pending' | 'running' | 'completed' | 'failed' | 'blocked'

export interface AgentWorkItem {
  id: string
  title: string
  description: string
  required_persona_category: string
  lease_requirements: unknown[]
  dependencies: string[]
  priority: number
  status: AgentWorkItemStatus
  attempts: number
  max_attempts: number
  running_session_id: string | null
  completed_session_id: string | null
  blocked_reason: string | null
  follow_up_origin_session_id: string | null
  source_intelligence_refs: Record<string, unknown> | null
  goal_mode_ref: Record<string, unknown> | null
  slice: Record<string, unknown>
}

export interface AgentWorkQueue {
  schema: typeof AGENT_WORK_QUEUE_SCHEMA
  updated_at: string
  total_work_items: number
  generated_work_item_count: number
  max_queue_expansion: number
  items: AgentWorkItem[]
}

export function createAgentWorkQueue(input: {
  slices?: any[]
  prompt?: string
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
  maxQueueExpansion?: number
} = {}): AgentWorkQueue {
  const sourceSlices = Array.isArray(input.slices) && input.slices.length
    ? input.slices
    : [{ id: 'slice-01', role: 'verifier', description: input.prompt || 'Native agent work item', write_paths: [], readonly_paths: [] }]
  const items = sourceSlices.map((slice, index): AgentWorkItem => ({
    id: String(slice.id || `work-${String(index + 1).padStart(3, '0')}`),
    title: String(slice.title || slice.id || `Work item ${index + 1}`),
    description: String(slice.description || input.prompt || 'Native agent work item'),
    required_persona_category: String(slice.required_persona_category || slice.role || 'verifier'),
    lease_requirements: [
      ...(Array.isArray(slice.write_paths) ? slice.write_paths.map((file: string) => ({ kind: 'write', path: file })) : []),
      ...(Array.isArray(slice.readonly_paths) ? slice.readonly_paths.map((file: string) => ({ kind: 'read', path: file })) : [])
    ],
    dependencies: Array.isArray(slice.dependencies) ? slice.dependencies.map(String) : [],
    priority: Number.isFinite(Number(slice.priority)) ? Number(slice.priority) : index + 1,
    status: 'pending',
    attempts: 0,
    max_attempts: Number.isFinite(Number(slice.max_attempts)) ? Number(slice.max_attempts) : 1,
    running_session_id: null,
    completed_session_id: null,
    blocked_reason: null,
    follow_up_origin_session_id: null,
    source_intelligence_refs: input.sourceIntelligenceRefs || null,
    goal_mode_ref: input.goalModeRef || null,
    slice: slice || {}
  }))
  return {
    schema: AGENT_WORK_QUEUE_SCHEMA,
    updated_at: nowIso(),
    total_work_items: items.length,
    generated_work_item_count: 0,
    max_queue_expansion: input.maxQueueExpansion ?? 10,
    items
  }
}

export function pendingWorkItems(queue: AgentWorkQueue) {
  const completed = new Set(queue.items.filter((item) => item.status === 'completed').map((item) => item.id))
  return queue.items
    .filter((item) => item.status === 'pending' && item.dependencies.every((dep) => completed.has(dep)))
    .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

export function leaseNextWorkItem(queue: AgentWorkQueue, sessionId: string): AgentWorkItem | null {
  const item = pendingWorkItems(queue)[0]
  if (!item) return null
  item.status = 'running'
  item.attempts += 1
  item.running_session_id = sessionId
  queue.updated_at = nowIso()
  return item
}

export function completeWorkItem(queue: AgentWorkQueue, itemId: string, sessionId: string, status: 'completed' | 'failed' | 'blocked', reason: string | null = null) {
  const item = queue.items.find((row) => row.id === itemId)
  if (!item) return null
  item.status = status
  item.running_session_id = null
  item.completed_session_id = sessionId
  item.blocked_reason = reason
  queue.updated_at = nowIso()
  return item
}

export function enqueueFollowUpWorkItems(queue: AgentWorkQueue, items: any[], input: {
  originSessionId: string
  sourceIntelligenceRefs?: Record<string, unknown> | null
  goalModeRef?: Record<string, unknown> | null
}) {
  const accepted: AgentWorkItem[] = []
  const remainingCapacity = Math.max(0, queue.max_queue_expansion - queue.generated_work_item_count)
  for (const [index, raw] of items.slice(0, remainingCapacity).entries()) {
    const id = String(raw.id || `follow-up-${queue.generated_work_item_count + index + 1}`)
    if (queue.items.some((item) => item.id === id)) continue
    accepted.push({
      id,
      title: String(raw.title || id),
      description: String(raw.description || raw.summary || id),
      required_persona_category: String(raw.required_persona_category || raw.role || 'verifier'),
      lease_requirements: Array.isArray(raw.lease_requirements) ? raw.lease_requirements : [],
      dependencies: Array.isArray(raw.dependencies) ? raw.dependencies.map(String) : [],
      priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : queue.items.length + accepted.length + 1,
      status: 'pending',
      attempts: 0,
      max_attempts: Number.isFinite(Number(raw.max_attempts)) ? Number(raw.max_attempts) : 1,
      running_session_id: null,
      completed_session_id: null,
      blocked_reason: null,
      follow_up_origin_session_id: input.originSessionId,
      source_intelligence_refs: input.sourceIntelligenceRefs || null,
      goal_mode_ref: input.goalModeRef || null,
      slice: raw
    })
  }
  queue.items.push(...accepted)
  queue.generated_work_item_count += accepted.length
  queue.total_work_items = queue.items.length
  queue.updated_at = nowIso()
  return {
    accepted,
    blocked_count: Math.max(0, items.length - accepted.length),
    blocked: items.length > accepted.length ? ['follow_up_work_items_exceeded_max_queue_expansion'] : []
  }
}

export async function writeAgentWorkQueue(root: string, queue: AgentWorkQueue) {
  queue.updated_at = nowIso()
  queue.total_work_items = queue.items.length
  await writeJsonAtomic(path.join(root, 'agent-work-queue.json'), queue)
  return queue
}

export async function appendAgentWorkQueueEvent(root: string, eventType: string, payload: Record<string, unknown> = {}) {
  await appendJsonl(path.join(root, 'agent-work-queue-events.jsonl'), {
    schema: AGENT_WORK_QUEUE_EVENT_SCHEMA,
    ts: nowIso(),
    event_type: eventType,
    payload
  })
}

export async function readAgentWorkQueue(root: string) {
  return readJson<AgentWorkQueue>(path.join(root, 'agent-work-queue.json'), {
    schema: AGENT_WORK_QUEUE_SCHEMA,
    updated_at: nowIso(),
    total_work_items: 0,
    generated_work_item_count: 0,
    max_queue_expansion: 10,
    items: []
  })
}

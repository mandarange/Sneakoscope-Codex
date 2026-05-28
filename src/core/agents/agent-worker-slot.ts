import path from 'node:path'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import type { AgentSessionGeneration } from './agent-session-generation.js'

export const AGENT_WORKER_SLOT_SCHEMA = 'sks.agent-worker-slot.v1'
export const AGENT_WORKER_SLOTS_SCHEMA = 'sks.agent-worker-slots.v1'

export type AgentWorkerSlotStatus = 'idle' | 'running' | 'draining' | 'closed'

export interface AgentWorkerSlot {
  schema: typeof AGENT_WORKER_SLOT_SCHEMA
  slot_id: string
  persona_assignment: Record<string, unknown>
  current_session_id: string | null
  current_generation_index: number | null
  generation_count: number
  status: AgentWorkerSlotStatus
  history: Array<{
    session_id: string
    generation_index: number
    task_id: string
    opened_at: string
    closed_at: string | null
    status: string
  }>
}

export function workerSlotId(index: number) {
  return `slot-${String(index).padStart(3, '0')}`
}

export function createAgentWorkerSlots(roster: any, targetActiveSlots: number): AgentWorkerSlot[] {
  const rows = Array.isArray(roster?.roster) && roster.roster.length ? roster.roster : [{ id: 'agent_1', persona_id: 'agent_1', role: 'verifier' }]
  return Array.from({ length: targetActiveSlots }, (_, index) => {
    const persona = rows[index % rows.length] || rows[0]
    return {
      schema: AGENT_WORKER_SLOT_SCHEMA,
      slot_id: workerSlotId(index + 1),
      persona_assignment: {
        agent_id: String(persona.id || `agent_${index + 1}`),
        persona_id: String(persona.persona_id || persona.id || `agent_${index + 1}`),
        role: String(persona.role || 'verifier'),
        write_policy: String(persona.write_policy || 'read-only'),
        reasoning_effort: persona.reasoning_effort || persona.model_reasoning_effort || null,
        reasoning_profile: persona.reasoning_profile || null,
        service_tier: persona.service_tier || 'fast',
        fast_mode: persona.fast_mode !== false
      },
      current_session_id: null,
      current_generation_index: null,
      generation_count: 0,
      status: 'idle',
      history: []
    }
  })
}

export function openWorkerSlotGeneration(slot: AgentWorkerSlot, generation: AgentSessionGeneration): AgentWorkerSlot {
  return {
    ...slot,
    current_session_id: generation.session_id,
    current_generation_index: generation.generation_index,
    generation_count: Math.max(slot.generation_count, generation.generation_index),
    status: 'running',
    history: [
      ...slot.history,
      {
        session_id: generation.session_id,
        generation_index: generation.generation_index,
        task_id: generation.task_id,
        opened_at: generation.started_at,
        closed_at: null,
        status: 'running'
      }
    ]
  }
}

export function markWorkerSlotGenerationClosed(slot: AgentWorkerSlot, sessionId: string, status: string): AgentWorkerSlot {
  return {
    ...slot,
    current_session_id: slot.current_session_id === sessionId ? null : slot.current_session_id,
    current_generation_index: slot.current_session_id === sessionId ? null : slot.current_generation_index,
    status: 'idle',
    history: slot.history.map((entry) => entry.session_id === sessionId
      ? { ...entry, closed_at: entry.closed_at || nowIso(), status }
      : entry)
  }
}

export function closeWorkerSlotsAfterDrain(slots: AgentWorkerSlot[]): AgentWorkerSlot[] {
  return slots.map((slot) => ({
    ...slot,
    current_session_id: null,
    current_generation_index: null,
    status: 'closed'
  }))
}

export async function writeAgentWorkerSlots(root: string, slots: AgentWorkerSlot[]) {
  const artifact = {
    schema: AGENT_WORKER_SLOTS_SCHEMA,
    updated_at: nowIso(),
    slot_count: slots.length,
    slots,
    all_slots_closed_after_drain: slots.length > 0 && slots.every((slot) => slot.status === 'closed')
  }
  await writeJsonAtomic(path.join(root, 'agent-worker-slots.json'), artifact)
  return artifact
}

export async function readAgentWorkerSlots(root: string) {
  return readJson<any>(path.join(root, 'agent-worker-slots.json'), {
    schema: AGENT_WORKER_SLOTS_SCHEMA,
    updated_at: nowIso(),
    slot_count: 0,
    slots: [],
    all_slots_closed_after_drain: false
  })
}

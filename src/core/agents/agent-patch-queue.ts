import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'

export const AGENT_PATCH_QUEUE_SCHEMA = 'sks.agent-patch-queue.v1'

export type AgentPatchQueueStatus = 'pending' | 'applying' | 'applied' | 'verified' | 'conflicted' | 'rolled_back' | 'rejected'

export interface AgentPatchQueueEntry {
  id: string
  mission_id?: string
  route?: string
  agent_id: string
  session_id?: string
  slot_id?: string
  generation_index?: number
  lease_id?: string
  write_paths: string[]
  envelope: AgentPatchEnvelope
  status: AgentPatchQueueStatus
  violations: string[]
  created_at: string
  updated_at: string
}

export interface AgentPatchQueueEvent {
  ts: string
  entry_id: string
  event_type: string
  status: AgentPatchQueueStatus
  violations: string[]
}

export interface AgentPatchQueueEnqueueContext {
  mission_id?: string
  route?: string
}

export class InMemoryAgentPatchQueue {
  readonly entries: AgentPatchQueueEntry[] = []
  readonly events: AgentPatchQueueEvent[] = []

  enqueue(input: any, context: AgentPatchQueueEnqueueContext = {}): AgentPatchQueueEntry {
    const envelope = normalizeAgentPatchEnvelope(input)
    const validation = validateAgentPatchEnvelope(envelope)
    const now = new Date().toISOString()
    const leaseId = envelope.lease_id || envelope.lease_proof?.lease_id
    const entry: AgentPatchQueueEntry = {
      id: `${envelope.agent_id}-${String(this.entries.length + 1).padStart(4, '0')}`,
      ...(context.mission_id ? { mission_id: context.mission_id } : {}),
      ...(context.route ? { route: context.route } : {}),
      agent_id: envelope.agent_id,
      ...(envelope.session_id ? { session_id: envelope.session_id } : {}),
      ...(envelope.slot_id ? { slot_id: envelope.slot_id } : {}),
      ...(envelope.generation_index === undefined ? {} : { generation_index: envelope.generation_index }),
      ...(leaseId ? { lease_id: leaseId } : {}),
      write_paths: envelope.operations.map((operation) => operation.path),
      envelope,
      status: validation.ok ? 'pending' : 'rejected',
      violations: validation.violations,
      created_at: now,
      updated_at: now
    }
    this.entries.push(entry)
    this.record(entry, 'enqueue')
    return entry
  }

  queued(): AgentPatchQueueEntry[] {
    return this.entries.filter((entry) => entry.status === 'pending')
  }

  markApplying(id: string): void {
    this.transition(id, 'applying')
  }

  markApplyingBatch(ids: readonly string[]): void {
    for (const id of ids) this.transition(id, 'applying')
  }

  markApplied(id: string): void {
    this.transition(id, 'applied')
  }

  markVerified(id: string): void {
    this.transition(id, 'verified')
  }

  markConflicted(id: string, violations: string[] = []): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) {
      entry.status = 'conflicted'
      entry.violations.push(...violations)
      entry.updated_at = new Date().toISOString()
      this.record(entry, 'conflict')
    }
  }

  markRolledBack(id: string): void {
    this.transition(id, 'rolled_back')
  }

  toJSON() {
    return {
      schema: AGENT_PATCH_QUEUE_SCHEMA,
      entries: this.entries,
      queued_count: this.queued().length,
      events: this.events,
      ownership_ledger: buildAgentPatchOwnershipLedger(this.entries)
    }
  }

  private transition(id: string, status: AgentPatchQueueStatus): void {
    const entry = this.entries.find((item) => item.id === id)
    if (!entry) return
    entry.status = status
    entry.updated_at = new Date().toISOString()
    this.record(entry, status)
  }

  private record(entry: AgentPatchQueueEntry, eventType: string): void {
    this.events.push({
      ts: new Date().toISOString(),
      entry_id: entry.id,
      event_type: eventType,
      status: entry.status,
      violations: [...entry.violations]
    })
  }
}

export function buildAgentPatchOwnershipLedger(entries: AgentPatchQueueEntry[]) {
  return entries.map((entry) => ({
    entry_id: entry.id,
    mission_id: entry.mission_id || null,
    route: entry.route || null,
    agent_id: entry.agent_id,
    session_id: entry.session_id || null,
    slot_id: entry.slot_id || null,
    generation_index: entry.generation_index ?? null,
    lease_id: entry.lease_id || null,
    write_paths: [...entry.write_paths],
    status: entry.status,
    created_at: entry.created_at,
    updated_at: entry.updated_at,
    violations: [...entry.violations]
  }))
}

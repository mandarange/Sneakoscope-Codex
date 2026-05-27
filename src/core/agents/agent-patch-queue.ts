import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'

export const AGENT_PATCH_QUEUE_SCHEMA = 'sks.agent-patch-queue.v1'

export interface AgentPatchQueueEntry {
  id: string
  envelope: AgentPatchEnvelope
  status: 'pending' | 'applying' | 'applied' | 'verified' | 'conflicted' | 'rolled_back' | 'rejected'
  violations: string[]
  created_at: string
  updated_at: string
}

export class InMemoryAgentPatchQueue {
  readonly entries: AgentPatchQueueEntry[] = []
  readonly events: Array<{ ts: string; entry_id: string; event_type: string; status: AgentPatchQueueEntry['status']; violations: string[] }> = []

  enqueue(input: any): AgentPatchQueueEntry {
    const envelope = normalizeAgentPatchEnvelope(input)
    const validation = validateAgentPatchEnvelope(envelope)
    const now = new Date().toISOString()
    const entry: AgentPatchQueueEntry = {
      id: `${envelope.agent_id}-${String(this.entries.length + 1).padStart(4, '0')}`,
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
      ownership_ledger: this.entries.map((entry) => ({
        entry_id: entry.id,
        agent_id: entry.envelope.agent_id,
        lease_id: entry.envelope.lease_id || entry.envelope.lease_proof?.lease_id || null,
        write_paths: entry.envelope.operations.map((operation) => operation.path)
      }))
    }
  }

  private transition(id: string, status: AgentPatchQueueEntry['status']): void {
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

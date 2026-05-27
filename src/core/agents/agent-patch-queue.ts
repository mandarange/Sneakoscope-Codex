import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'

export const AGENT_PATCH_QUEUE_SCHEMA = 'sks.agent-patch-queue.v1'

export interface AgentPatchQueueEntry {
  id: string
  envelope: AgentPatchEnvelope
  status: 'pending' | 'applying' | 'applied' | 'verified' | 'conflicted' | 'rolled_back' | 'rejected'
  violations: string[]
}

export class InMemoryAgentPatchQueue {
  readonly entries: AgentPatchQueueEntry[] = []

  enqueue(input: any): AgentPatchQueueEntry {
    const envelope = normalizeAgentPatchEnvelope(input)
    const validation = validateAgentPatchEnvelope(envelope)
    const entry: AgentPatchQueueEntry = {
      id: `${envelope.agent_id}-${String(this.entries.length + 1).padStart(4, '0')}`,
      envelope,
      status: validation.ok ? 'pending' : 'rejected',
      violations: validation.violations
    }
    this.entries.push(entry)
    return entry
  }

  queued(): AgentPatchQueueEntry[] {
    return this.entries.filter((entry) => entry.status === 'pending')
  }

  markApplying(id: string): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) entry.status = 'applying'
  }

  markApplied(id: string): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) entry.status = 'applied'
  }

  markVerified(id: string): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) entry.status = 'verified'
  }

  markConflicted(id: string, violations: string[] = []): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) {
      entry.status = 'conflicted'
      entry.violations.push(...violations)
    }
  }

  markRolledBack(id: string): void {
    const entry = this.entries.find((item) => item.id === id)
    if (entry) entry.status = 'rolled_back'
  }

  toJSON() {
    return {
      schema: AGENT_PATCH_QUEUE_SCHEMA,
      entries: this.entries,
      queued_count: this.queued().length
    }
  }
}

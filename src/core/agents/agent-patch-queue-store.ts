import path from 'node:path'
import { appendJsonl, readJson, writeJsonAtomic } from '../fsx.js'
import { AGENT_PATCH_QUEUE_SCHEMA, InMemoryAgentPatchQueue, buildAgentPatchOwnershipLedger, type AgentPatchQueueEntry, type AgentPatchQueueEvent } from './agent-patch-queue.js'
import { AgentPatchTransactionJournal } from './agent-patch-transaction-journal.js'

export const AGENT_PATCH_QUEUE_ARTIFACT = 'agent-patch-queue.json'
export const AGENT_PATCH_QUEUE_EVENTS_ARTIFACT = 'agent-patch-queue-events.jsonl'
export const AGENT_PATCH_OWNERSHIP_LEDGER_ARTIFACT = 'agent-patch-ownership-ledger.json'

export class PersistentAgentPatchQueueStore {
  readonly artifactDir: string
  readonly queue: InMemoryAgentPatchQueue
  readonly journal: AgentPatchTransactionJournal

  constructor(artifactDir: string, queue = new InMemoryAgentPatchQueue()) {
    this.artifactDir = artifactDir
    this.queue = queue
    this.journal = new AgentPatchTransactionJournal(artifactDir)
  }

  async enqueue(input: any, context: { mission_id?: string; route?: string } = {}): Promise<AgentPatchQueueEntry> {
    const entry = this.queue.enqueue(input, context)
    await this.persistSnapshot()
    await this.appendEvent(this.queue.events.at(-1))
    await this.journal.append({
      event_type: 'enqueue',
      entry_id: entry.id,
      agent_id: entry.agent_id,
      lease_id: entry.lease_id || null,
      status: entry.status,
      changed_files: entry.write_paths,
      violations: entry.violations
    })
    return entry
  }

  async markApplying(id: string): Promise<void> {
    await this.transition(id, () => this.queue.markApplying(id))
  }

  async markApplied(id: string): Promise<void> {
    await this.transition(id, () => this.queue.markApplied(id))
  }

  async markVerified(id: string): Promise<void> {
    await this.transition(id, () => this.queue.markVerified(id))
  }

  async markConflicted(id: string, violations: string[] = []): Promise<void> {
    await this.transition(id, () => this.queue.markConflicted(id, violations))
  }

  async markRolledBack(id: string): Promise<void> {
    await this.transition(id, () => this.queue.markRolledBack(id))
  }

  async persistSnapshot(): Promise<void> {
    const json = this.queue.toJSON()
    await writeJsonAtomic(path.join(this.artifactDir, AGENT_PATCH_QUEUE_ARTIFACT), json)
    await writeJsonAtomic(path.join(this.artifactDir, AGENT_PATCH_OWNERSHIP_LEDGER_ARTIFACT), {
      schema: 'sks.agent-patch-ownership-ledger.v1',
      queue_schema: AGENT_PATCH_QUEUE_SCHEMA,
      entries: buildAgentPatchOwnershipLedger(this.queue.entries)
    })
  }

  static async load(artifactDir: string): Promise<PersistentAgentPatchQueueStore> {
    const queue = new InMemoryAgentPatchQueue()
    const snapshot = await readJson<any>(path.join(artifactDir, AGENT_PATCH_QUEUE_ARTIFACT), null)
    if (snapshot && Array.isArray(snapshot.entries)) queue.entries.push(...snapshot.entries)
    if (snapshot && Array.isArray(snapshot.events)) queue.events.push(...snapshot.events)
    return new PersistentAgentPatchQueueStore(artifactDir, queue)
  }

  private async transition(id: string, mutate: () => void): Promise<void> {
    const beforeEventCount = this.queue.events.length
    mutate()
    await this.persistSnapshot()
    for (const event of this.queue.events.slice(beforeEventCount)) await this.appendEvent(event)
    const entry = this.queue.entries.find((item) => item.id === id)
    if (entry && ['verified', 'conflicted', 'rolled_back', 'rejected'].includes(entry.status)) {
      await this.journal.append({
        event_type: 'final_status',
        entry_id: entry.id,
        agent_id: entry.agent_id,
        lease_id: entry.lease_id || null,
        status: entry.status,
        changed_files: entry.write_paths,
        violations: entry.violations
      })
    }
  }

  private async appendEvent(event: AgentPatchQueueEvent | undefined): Promise<void> {
    if (!event) return
    await appendJsonl(path.join(this.artifactDir, AGENT_PATCH_QUEUE_EVENTS_ARTIFACT), event)
  }
}

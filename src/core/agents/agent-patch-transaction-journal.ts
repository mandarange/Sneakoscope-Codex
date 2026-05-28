import fs from 'node:fs/promises'
import path from 'node:path'
import { appendJsonl, exists, nowIso, readText, sha256, writeJsonAtomic } from '../fsx.js'

export const AGENT_PATCH_TRANSACTION_JOURNAL_SCHEMA = 'sks.agent-patch-transaction-journal.v1'
export const AGENT_PATCH_TRANSACTION_JOURNAL_ARTIFACT = 'agent-patch-transaction-journal.jsonl'
export const AGENT_PATCH_TRANSACTION_JOURNAL_SUMMARY_ARTIFACT = 'agent-patch-transaction-journal-summary.json'

export type AgentPatchTransactionEventType =
  | 'enqueue'
  | 'lock_acquired'
  | 'lock_released'
  | 'apply_started'
  | 'apply_finished'
  | 'verification_started'
  | 'verification_finished'
  | 'rollback_dry_run_started'
  | 'rollback_dry_run_finished'
  | 'final_status'

export interface AgentPatchTransactionJournalEvent {
  schema: typeof AGENT_PATCH_TRANSACTION_JOURNAL_SCHEMA
  ts: string
  event_type: AgentPatchTransactionEventType
  entry_id: string
  agent_id?: string | null
  lease_id?: string | null
  status?: string | null
  lock_path?: string | null
  lock_acquired?: boolean
  before_hashes?: Record<string, string>
  after_hashes?: Record<string, string>
  changed_files?: string[]
  rollback_digest?: string | null
  verification_status?: string | null
  duration_ms?: number
  violations?: string[]
}

export interface AgentPatchTransactionJournalSummary {
  schema: 'sks.agent-patch-transaction-journal-summary.v1'
  generated_at: string
  ok: boolean
  journal: string
  event_count: number
  entry_ids: string[]
  event_types: AgentPatchTransactionEventType[]
  entries: Array<{
    entry_id: string
    event_types: string[]
    final_status: string | null
    changed_files: string[]
    rollback_digest: string | null
    verification_status: string | null
    before_hashes: Record<string, string>
    after_hashes: Record<string, string>
    duration_ms: number
  }>
  blockers: string[]
}

export class AgentPatchTransactionJournal {
  readonly artifactDir: string
  readonly file: string

  constructor(artifactDir: string) {
    this.artifactDir = artifactDir
    this.file = path.join(artifactDir, AGENT_PATCH_TRANSACTION_JOURNAL_ARTIFACT)
  }

  async append(input: Omit<AgentPatchTransactionJournalEvent, 'schema' | 'ts'> & { ts?: string }): Promise<AgentPatchTransactionJournalEvent> {
    const event: AgentPatchTransactionJournalEvent = {
      schema: AGENT_PATCH_TRANSACTION_JOURNAL_SCHEMA,
      ts: input.ts || nowIso(),
      event_type: input.event_type,
      entry_id: String(input.entry_id || 'unknown-entry'),
      ...(input.agent_id === undefined ? {} : { agent_id: input.agent_id }),
      ...(input.lease_id === undefined ? {} : { lease_id: input.lease_id }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.lock_path === undefined ? {} : { lock_path: input.lock_path }),
      ...(input.lock_acquired === undefined ? {} : { lock_acquired: input.lock_acquired }),
      ...(input.before_hashes === undefined ? {} : { before_hashes: input.before_hashes }),
      ...(input.after_hashes === undefined ? {} : { after_hashes: input.after_hashes }),
      ...(input.changed_files === undefined ? {} : { changed_files: input.changed_files.map(String) }),
      ...(input.rollback_digest === undefined ? {} : { rollback_digest: input.rollback_digest }),
      ...(input.verification_status === undefined ? {} : { verification_status: input.verification_status }),
      ...(input.duration_ms === undefined ? {} : { duration_ms: Math.max(0, Math.floor(Number(input.duration_ms) || 0)) }),
      ...(input.violations === undefined ? {} : { violations: input.violations.map(String) })
    }
    await appendJsonl(this.file, event)
    return event
  }

  async writeSummary(): Promise<AgentPatchTransactionJournalSummary> {
    const summary = await summarizeAgentPatchTransactionJournal(this.artifactDir)
    await writeJsonAtomic(path.join(this.artifactDir, AGENT_PATCH_TRANSACTION_JOURNAL_SUMMARY_ARTIFACT), summary)
    return summary
  }
}

export async function summarizeAgentPatchTransactionJournal(artifactDir: string): Promise<AgentPatchTransactionJournalSummary> {
  const file = path.join(artifactDir, AGENT_PATCH_TRANSACTION_JOURNAL_ARTIFACT)
  const text = await readText(file, '')
  const events = text.split(/\n+/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line) as AgentPatchTransactionJournalEvent]
    } catch {
      return []
    }
  })
  const byEntry = new Map<string, AgentPatchTransactionJournalEvent[]>()
  for (const event of events) {
    const id = String(event.entry_id || 'unknown-entry')
    if (!byEntry.has(id)) byEntry.set(id, [])
    byEntry.get(id)?.push(event)
  }
  const entries = [...byEntry.entries()].map(([entryId, rows]) => {
    const final = [...rows].reverse().find((row) => row.event_type === 'final_status')
    return {
      entry_id: entryId,
      event_types: [...new Set(rows.map((row) => String(row.event_type)))],
      final_status: final?.status || null,
      changed_files: [...new Set(rows.flatMap((row) => row.changed_files || []))].sort(),
      rollback_digest: [...rows].reverse().find((row) => row.rollback_digest)?.rollback_digest || null,
      verification_status: [...rows].reverse().find((row) => row.verification_status)?.verification_status || null,
      before_hashes: Object.assign({}, ...rows.map((row) => row.before_hashes || {})),
      after_hashes: Object.assign({}, ...rows.map((row) => row.after_hashes || {})),
      duration_ms: rows.reduce((sum, row) => sum + Math.max(0, Number(row.duration_ms || 0)), 0)
    }
  })
  const requiredChangedLifecycle = ['enqueue', 'lock_acquired', 'lock_released', 'apply_started', 'apply_finished', 'verification_finished', 'rollback_dry_run_finished', 'final_status']
  const blockers = [
    ...entries.filter((entry) => !entry.event_types.includes('enqueue')).map((entry) => `journal_enqueue_missing:${entry.entry_id}`),
    ...entries.filter((entry) => entry.changed_files.length > 0).flatMap((entry) => {
      return requiredChangedLifecycle
        .filter((eventType) => !entry.event_types.includes(eventType))
        .map((eventType) => `journal_${eventType}_missing:${entry.entry_id}`)
    }),
    ...entries.filter((entry) => entry.changed_files.length > 0 && !entry.rollback_digest).map((entry) => `journal_rollback_digest_missing:${entry.entry_id}`),
    ...entries.filter((entry) => entry.changed_files.length > 0 && !entry.verification_status).map((entry) => `journal_verification_status_missing:${entry.entry_id}`),
    ...(events.length === 0 ? ['journal_empty'] : [])
  ]
  return {
    schema: 'sks.agent-patch-transaction-journal-summary.v1',
    generated_at: nowIso(),
    ok: blockers.length === 0,
    journal: AGENT_PATCH_TRANSACTION_JOURNAL_ARTIFACT,
    event_count: events.length,
    entry_ids: [...byEntry.keys()].sort(),
    event_types: [...new Set(events.map((event) => event.event_type))] as AgentPatchTransactionEventType[],
    entries,
    blockers
  }
}

export async function hashFilesForJournal(root: string, files: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const file of [...new Set(files.map(normalizeRelPath).filter(Boolean))].sort()) {
    const absolute = path.resolve(root, file)
    if (!absolute.startsWith(path.resolve(root) + path.sep)) continue
    out[file] = await exists(absolute) ? sha256(await fs.readFile(absolute)) : 'missing'
  }
  return out
}

function normalizeRelPath(value: string): string {
  const normalized = path.posix.normalize(String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, ''))
  return normalized === '.' ? '' : normalized
}

import path from 'node:path'
import { appendJsonl, appendJsonlMany, ensureDir, readJson, writeJsonAtomic } from '../fsx.js'
import { AGENT_PATCH_QUEUE_SCHEMA, InMemoryAgentPatchQueue, buildAgentPatchOwnershipLedger, type AgentPatchQueueEntry, type AgentPatchQueueEvent } from './agent-patch-queue.js'
import { AgentPatchTransactionJournal } from './agent-patch-transaction-journal.js'
import { normalizeAgentPatchEnvelope } from './agent-patch-schema.js'
import { scanImpact } from '../verification/impact-scan.js'
import { runMachineFeedback } from '../verification/machine-feedback.js'
import { analyzeDiffQuality } from '../verification/diff-quality.js'

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

  async enqueue(input: any, context: { mission_id?: string; route?: string; root?: string; work_item_kind?: string; regression_proof?: Record<string, unknown>; repair_hypothesis?: Record<string, unknown> } = {}): Promise<AgentPatchQueueEntry> {
    const preflight = await this.runQualityPreflight(input, context)
    const entry = this.queue.enqueue(input, {
      ...(context.mission_id ? { mission_id: context.mission_id } : {}),
      ...(context.route ? { route: context.route } : {}),
      preflight_violations: preflight.violations,
      preflight_reports: preflight.reports
    })
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

  private async runQualityPreflight(input: any, context: { root?: string; work_item_kind?: string; regression_proof?: Record<string, unknown>; repair_hypothesis?: Record<string, unknown> } = {}): Promise<{ violations: string[]; reports: Record<string, unknown> }> {
    const envelope = normalizeAgentPatchEnvelope(input)
    const changedFiles = changedFilesForEnvelope(envelope)
    const patchText = patchTextForEnvelope(envelope)
    const root = envelope.git_worktree?.worktree_path || context.root || process.cwd()
    const reportDir = path.join(this.artifactDir, 'patch-quality', safeName(`${envelope.agent_id}-${envelope.session_id}-${Date.now()}`))
    await ensureDir(reportDir)
    const [impact, diffQuality, feedback] = await Promise.all([
      scanImpact(root, changedFiles, patchText).catch((err) => ({ schema: 'sks.impact-scan.v1', changed_symbols: [], references: [], cochange_required: [], tool: 'builtin', error: errorMessage(err) })),
      analyzeDiffQuality({
        root,
        changedFiles,
        patchText,
        plannedFiles: envelope.allowed_paths || envelope.lease_proof?.allowed_paths || []
      }).catch((err) => ({ schema: 'sks.diff-quality.v1', minimality: { plan_files: 0, touched_files: changedFiles.length, ratio: 1 }, dead_additions: [], comment_noise: 0, guard_bloat: 0, warnings: [], errors: [`diff_quality_failed:${errorMessage(err)}`] })),
      runMachineFeedback(root, changedFiles, { timeoutMs: 60_000 }).catch((err) => ({ schema: 'sks.machine-feedback.v1', ok: false, typecheck: { ok: false, errors: [errorMessage(err)] }, lint: { ok: true, errors: [] }, tests: { ok: true, selected: [], failed: [], skipped_reason: 'machine_feedback_exception' }, duration_ms: 0 }))
    ])
    await writeJsonAtomic(path.join(reportDir, 'impact-scan.json'), impact)
    await writeJsonAtomic(path.join(reportDir, 'diff-quality.json'), diffQuality)
    await writeJsonAtomic(path.join(reportDir, 'machine-feedback.json'), feedback)
    const cochangeAck = envelope.cochange_acknowledged === true && String(envelope.cochange_acknowledged_reason || '').trim().length > 0
    const violations = [
      ...((impact as any).cochange_required?.length && !cochangeAck ? [`impact_scan_cochange_missing:${(impact as any).cochange_required.slice(0, 5).join(',')}`] : []),
      ...(((diffQuality as any).errors || []).map((issue: string) => `diff_quality:${issue}`)),
      ...((feedback as any).ok === false ? ['machine_feedback_failed'] : []),
      ...(isRepairKind(context.work_item_kind, envelope.task_slice_id) && !(envelope.repair_hypothesis || context.repair_hypothesis) ? ['repair_without_hypothesis'] : [])
    ]
    return {
      violations,
      reports: {
        impact_scan: path.relative(this.artifactDir, path.join(reportDir, 'impact-scan.json')),
        diff_quality: path.relative(this.artifactDir, path.join(reportDir, 'diff-quality.json')),
        machine_feedback: path.relative(this.artifactDir, path.join(reportDir, 'machine-feedback.json'))
      }
    }
  }

  async markApplying(id: string): Promise<void> {
    await this.transition(id, () => this.queue.markApplying(id))
  }

  async markApplyingBatch(ids: readonly string[]): Promise<void> {
    const uniqueIds = [...new Set(ids.map(String).filter(Boolean))]
    if (!uniqueIds.length) return
    const beforeEventCount = this.queue.events.length
    this.queue.markApplyingBatch(uniqueIds)
    await this.persistSnapshot()
    await this.appendEvents(this.queue.events.slice(beforeEventCount))
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
    await this.appendEvents(this.queue.events.slice(beforeEventCount))
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

  private async appendEvents(events: readonly AgentPatchQueueEvent[]): Promise<void> {
    await appendJsonlMany(path.join(this.artifactDir, AGENT_PATCH_QUEUE_EVENTS_ARTIFACT), events.filter(Boolean))
  }
}

function isRepairKind(kind: unknown, id: unknown): boolean {
  const text = `${String(kind || '')} ${String(id || '')}`.toLowerCase();
  return /\b(conflict_resolution|repair|conflict|rebase|rollback)\b|수리|충돌/.test(text);
}

function changedFilesForEnvelope(envelope: ReturnType<typeof normalizeAgentPatchEnvelope>): string[] {
  const files = envelope.git_worktree?.changed_files?.length
    ? envelope.git_worktree.changed_files
    : envelope.operations.map((operation) => operation.path)
  return [...new Set(files.map(normalizePath).filter(Boolean))]
}

function patchTextForEnvelope(envelope: ReturnType<typeof normalizeAgentPatchEnvelope>): string {
  return envelope.operations.map((operation) => {
    if (operation.diff) return operation.diff
    if (operation.op === 'replace') return [
      `--- a/${operation.path}`,
      `+++ b/${operation.path}`,
      `-${operation.search || ''}`,
      `+${operation.replace || ''}`
    ].join('\n')
    if (operation.op === 'write') return [
      `--- /dev/null`,
      `+++ b/${operation.path}`,
      ...String(operation.content || '').split(/\r?\n/).map((line) => `+${line}`)
    ].join('\n')
    return ''
  }).join('\n')
}

function normalizePath(value: string): string {
  return String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, '')
}

function safeName(value: string): string {
  return String(value || 'patch').replace(/[^A-Za-z0-9_.-]+/g, '-').slice(0, 160)
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

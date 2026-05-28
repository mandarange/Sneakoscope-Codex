import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { applyAgentPatchQueueEntry, rollbackAgentPatchApply } from './agent-patch-apply-worker.js'
import type { AgentPatchQueueEntry } from './agent-patch-queue.js'
import { AgentPatchTransactionJournal } from './agent-patch-transaction-journal.js'

export const AGENT_PATCH_CONFLICT_REBASE_SCHEMA = 'sks.agent-patch-conflict-rebase.v1'
export const AGENT_PATCH_CONFLICT_REBASE_ARTIFACT = 'agent-patch-conflict-rebase-results.json'

export interface AgentPatchConflictRebaseResult {
  schema: typeof AGENT_PATCH_CONFLICT_REBASE_SCHEMA
  generated_at: string
  ok: boolean
  dry_run: boolean
  group_results: AgentPatchConflictRebaseGroupResult[]
  apply_results: any[]
  succeeded_entry_ids: string[]
  failed_entry_ids: string[]
  blocked_entry_ids: string[]
  rebase_attempt_count: number
  blockers: string[]
}

export interface AgentPatchConflictRebaseGroupResult {
  group_id: string
  reason: string
  file: string | null
  policy: 'serial_retry' | 'blocked'
  attempts: Array<{
    entry_id: string
    agent_id: string
    attempt: number
    status: 'rebased' | 'blocked'
    changed_files: string[]
    violations: string[]
  }>
  blockers: string[]
}

export async function executeAgentPatchConflictRebase(
  root: string,
  entries: AgentPatchQueueEntry[],
  merge: any,
  opts: { dryRun?: boolean; artifactsDir?: string; allowDomainRetry?: boolean } = {}
): Promise<AgentPatchConflictRebaseResult> {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  const groups = Array.isArray(merge?.serial_merge_groups) ? merge.serial_merge_groups : []
  const groupResults: AgentPatchConflictRebaseGroupResult[] = []
  const applyResults: any[] = []
  for (const group of groups) {
    const reason = String(group?.reason || '')
    const policy = serialRetryAllowed(reason, opts) ? 'serial_retry' : 'blocked'
    const attempts: AgentPatchConflictRebaseGroupResult['attempts'] = []
    const blockers: string[] = []
    const groupEntries = (Array.isArray(group?.entry_ids) ? group.entry_ids : []).map((id: any) => byId.get(String(id))).filter(Boolean) as AgentPatchQueueEntry[]
    if (policy === 'blocked') {
      blockers.push(`serial_rebase_blocked_by_policy:${reason || 'unknown'}`)
      for (const entry of groupEntries) {
        attempts.push({ entry_id: entry.id, agent_id: entry.agent_id, attempt: 0, status: 'blocked', changed_files: [], violations: blockers })
      }
    } else {
      let attempt = 0
      for (const entry of groupEntries) {
        attempt += 1
        const applyResult = await safelyApplySerialRebaseEntry(root, entry, {
          dryRun: opts.dryRun === true,
          ...(opts.artifactsDir ? { artifactsDir: opts.artifactsDir } : {})
        })
        const rollbackDryRun = applyResult?.ok === true
          ? await runSerialRebaseRollbackDryRun(root, applyResult, opts.artifactsDir)
          : null
        const violations = [
          ...(Array.isArray(applyResult?.violations) ? applyResult.violations.map(String) : []),
          ...(rollbackDryRun && rollbackDryRun.ok === false ? (rollbackDryRun.violations || ['rollback_dry_run_failed']).map(String) : [])
        ]
        const attemptOk = applyResult?.ok === true && rollbackDryRun?.ok !== false
        applyResults.push({ ...applyResult, rollback_dry_run: rollbackDryRun, serial_rebase_group_id: String(group?.group_id || ''), rebase_attempt: attempt })
        attempts.push({
          entry_id: entry.id,
          agent_id: entry.agent_id,
          attempt,
          status: attemptOk ? 'rebased' : 'blocked',
          changed_files: Array.isArray(applyResult?.changed_files) ? applyResult.changed_files.map(String) : [],
          violations
        })
        if (!attemptOk) blockers.push(...(violations.length ? violations : [`serial_rebase_failed:${entry.id}`]))
      }
    }
    groupResults.push({
      group_id: String(group?.group_id || `serial-${groupResults.length + 1}`),
      reason,
      file: group?.file ? String(group.file) : null,
      policy,
      attempts,
      blockers: [...new Set(blockers)]
    })
  }
  const succeeded = groupResults.flatMap((group) => group.attempts.filter((attempt) => attempt.status === 'rebased').map((attempt) => attempt.entry_id))
  const failed = groupResults.flatMap((group) => group.attempts.filter((attempt) => attempt.status === 'blocked' && group.policy === 'serial_retry').map((attempt) => attempt.entry_id))
  const blocked = groupResults.flatMap((group) => group.attempts.filter((attempt) => attempt.status === 'blocked' && group.policy === 'blocked').map((attempt) => attempt.entry_id))
  const blockers = [...new Set(groupResults.flatMap((group) => group.blockers))]
  const result: AgentPatchConflictRebaseResult = {
    schema: AGENT_PATCH_CONFLICT_REBASE_SCHEMA,
    generated_at: nowIso(),
    ok: failed.length === 0 && blocked.length === 0,
    dry_run: opts.dryRun === true,
    group_results: groupResults,
    apply_results: applyResults,
    succeeded_entry_ids: [...new Set(succeeded)],
    failed_entry_ids: [...new Set(failed)],
    blocked_entry_ids: [...new Set(blocked)],
    rebase_attempt_count: groupResults.reduce((sum, group) => sum + group.attempts.filter((attempt) => attempt.attempt > 0).length, 0),
    blockers
  }
  if (opts.artifactsDir) await writeJsonAtomic(path.join(opts.artifactsDir, AGENT_PATCH_CONFLICT_REBASE_ARTIFACT), result)
  return result
}

async function safelyApplySerialRebaseEntry(
  root: string,
  entry: AgentPatchQueueEntry,
  opts: { dryRun?: boolean; artifactsDir?: string }
): Promise<any> {
  try {
    return await applyAgentPatchQueueEntry(root, entry, opts)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return {
      schema: 'sks.agent-patch-apply-result.v1',
      entry_id: entry.id,
      agent_id: entry.agent_id,
      lease_id: entry.lease_id || entry.envelope?.lease_id || entry.envelope?.lease_proof?.lease_id || null,
      ok: false,
      status: 'blocked',
      dry_run: opts.dryRun === true,
      changed_files: [],
      rollback: [],
      rollback_digest: null,
      before_hashes: {},
      after_hashes: {},
      verification: { status: 'blocked', checks: ['serial-rebase-exception'] },
      violations: [`serial_rebase_exception:${message}`]
    }
  }
}

function serialRetryAllowed(reason: string, opts: { allowDomainRetry?: boolean }): boolean {
  if (/protected_path|lease_path_not_allowed|entry_not_pending/.test(reason)) return false
  if (/domain_conflict/.test(reason)) return opts.allowDomainRetry === true
  return /parallel_write_conflict|subtree_write_conflict|stale_context/.test(reason)
}

async function runSerialRebaseRollbackDryRun(root: string, applyResult: any, artifactsDir?: string): Promise<any> {
  const journal = artifactsDir ? new AgentPatchTransactionJournal(artifactsDir) : null
  await journal?.append({
    event_type: 'rollback_dry_run_started',
    entry_id: applyResult.entry_id || 'unknown-entry',
    agent_id: applyResult.agent_id || null,
    lease_id: applyResult.lease_id || null,
    status: 'started',
    changed_files: applyResult.changed_files || [],
    rollback_digest: applyResult.rollback_digest || null
  })
  const rollbackDryRun = await rollbackAgentPatchApply(root, applyResult, { dryRun: true })
  await journal?.append({
    event_type: 'rollback_dry_run_finished',
    entry_id: applyResult.entry_id || 'unknown-entry',
    agent_id: applyResult.agent_id || null,
    lease_id: applyResult.lease_id || null,
    status: rollbackDryRun.status || null,
    changed_files: applyResult.changed_files || [],
    rollback_digest: rollbackDryRun.rollback_digest || applyResult.rollback_digest || null,
    violations: rollbackDryRun.violations || []
  })
  return rollbackDryRun
}

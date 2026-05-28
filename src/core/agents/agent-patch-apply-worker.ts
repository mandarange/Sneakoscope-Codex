import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, exists, nowIso, sha256, writeJsonAtomic } from '../fsx.js'
import { validateAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'
import type { AgentPatchQueueEntry } from './agent-patch-queue.js'
import { AgentPatchTransactionJournal } from './agent-patch-transaction-journal.js'

export const AGENT_PATCH_APPLY_SCHEMA = 'sks.agent-patch-apply-result.v1'
export const AGENT_PATCH_ROLLBACK_SCHEMA = 'sks.agent-patch-rollback-result.v1'

const PROTECTED_PATH_RE = /^(?:\.codex\/|\.agents\/skills\/|\.codex\/agents\/|AGENTS\.md$|node_modules\/sneakoscope\/|\.sneakoscope\/.*policy.*\.json$)/
const activeFileLocks = new Set<string>()

export async function applyAgentPatchEnvelope(root: string, envelope: AgentPatchEnvelope, opts: { dryRun?: boolean; entryId?: string; artifactsDir?: string; expectedBeforeHashes?: Record<string, string> } = {}) {
  const startedAt = nowIso()
  const startedMs = Date.now()
  const journal = opts.artifactsDir ? new AgentPatchTransactionJournal(opts.artifactsDir) : null
  const entryId = opts.entryId || `${envelope.agent_id || 'unknown-agent'}:direct`
  await journal?.append({
    event_type: 'apply_started',
    entry_id: entryId,
    agent_id: envelope.agent_id || null,
    lease_id: envelope.lease_id || envelope.lease_proof?.lease_id || null,
    status: 'started'
  })
  const validation = validateAgentPatchEnvelope(envelope)
  const violations = [...validation.violations]
  if (!validation.ok) {
    const blocked = result(false, [], [], violations, opts.dryRun === true, startedAt, startedMs, envelope, {}, opts.entryId)
    await journalApplyFinished(journal, entryId, blocked)
    return writeResultArtifact(blocked, opts)
  }
  const rootResolved = path.resolve(root)
  const buffers = new Map<string, { absolute: string; beforeExists: boolean; before: string; after: string }>()
  const locks: Array<{ absolute: string; lockFile?: string }> = []

  try {
    for (const operation of envelope.operations) {
      const rel = normalizeRelPath(operation.path)
      if (PROTECTED_PATH_RE.test(rel)) {
        violations.push(`protected_path:${rel}`)
        continue
      }
      if (!pathAllowedByLease(rel, envelope)) {
        violations.push(`lease_path_not_allowed:${rel}`)
        continue
      }
      const absolute = path.resolve(root, rel)
      if (!absolute.startsWith(rootResolved + path.sep)) {
        violations.push(`path_outside_root:${rel}`)
        continue
      }
      if (!buffers.has(rel)) {
        const lock = await acquireFileLock(absolute, opts.artifactsDir)
        if (!lock.ok) {
          violations.push(`file_lock_busy:${rel}`)
          continue
        }
        locks.push({ absolute, ...(lock.lockFile ? { lockFile: lock.lockFile } : {}) })
        await journal?.append({
          event_type: 'lock_acquired',
          entry_id: entryId,
          agent_id: envelope.agent_id || null,
          lease_id: envelope.lease_id || envelope.lease_proof?.lease_id || null,
          status: 'locked',
          lock_path: lock.lockFile || rel,
          lock_acquired: true
        })
        const beforeExists = await exists(absolute)
        const before = beforeExists ? await fs.readFile(absolute, 'utf8') : ''
        const expectedHash = opts.expectedBeforeHashes?.[rel]
        if (expectedHash && sha256(before) !== expectedHash) {
          violations.push(`dirty_unrelated_change:${rel}`)
          continue
        }
        buffers.set(rel, { absolute, beforeExists, before, after: before })
      }
      const state = buffers.get(rel)!
      if (operation.op === 'replace') {
        const search = String(operation.search || '')
        if (!state.after.includes(search)) {
          violations.push(`search_not_found:${rel}`)
          continue
        }
        state.after = state.after.replace(search, String(operation.replace || ''))
      } else if (operation.op === 'write') {
        if (!envelope.rollback_hint && !envelope.lease_proof?.rollback_node_id) {
          violations.push(`direct_write_without_rollback_hint:${rel}`)
          continue
        }
        state.after = String(operation.content || '')
      } else {
        const patchResult = applyUnifiedDiffPatch(state.after, String(operation.diff || ''))
        if (!patchResult.ok) {
          violations.push(`unified_diff_apply_failed:${rel}`)
          continue
        }
        state.after = patchResult.text
      }
    }
    if (violations.length > 0) {
      const blocked = result(false, [], [], violations, opts.dryRun === true, startedAt, startedMs, envelope, beforeHashes(buffers), opts.entryId)
      await journalApplyFinished(journal, entryId, blocked)
      return writeResultArtifact(blocked, opts)
    }
    const plans = [...buffers.entries()].filter(([, state]) => state.before !== state.after || !state.beforeExists)
    const changedFiles = plans.map(([rel]) => rel)
    const rollback = plans.map(([rel, state]) => ({
      path: rel,
      existed: state.beforeExists,
      sha256_before: state.beforeExists ? sha256(state.before) : null,
      sha256_after: sha256(state.after),
      content_before: state.beforeExists ? state.before : null
    }))
    if (!opts.dryRun) {
      for (const [, state] of plans) {
        await ensureDir(path.dirname(state.absolute))
        await fs.writeFile(state.absolute, state.after, 'utf8')
      }
    }
    const applied = result(true, changedFiles, rollback, violations, opts.dryRun === true, startedAt, startedMs, envelope, beforeHashes(buffers), opts.entryId)
    await journalApplyFinished(journal, entryId, applied)
    return writeResultArtifact(applied, opts)
  } finally {
    for (const lock of locks) {
      await releaseFileLock(lock.absolute, lock.lockFile)
      await journal?.append({
        event_type: 'lock_released',
        entry_id: entryId,
        agent_id: envelope.agent_id || null,
        lease_id: envelope.lease_id || envelope.lease_proof?.lease_id || null,
        status: 'unlocked',
        lock_path: lock.lockFile || lock.absolute,
        lock_acquired: false
      })
    }
  }
}

export async function applyAgentPatchQueueEntry(root: string, entry: AgentPatchQueueEntry, opts: { dryRun?: boolean; artifactsDir?: string; expectedBeforeHashes?: Record<string, string> } = {}) {
  return applyAgentPatchEnvelope(root, entry.envelope, { ...opts, entryId: entry.id })
}

export async function rollbackAgentPatchApply(root: string, applyResult: any, opts: { dryRun?: boolean } = {}) {
  const rootResolved = path.resolve(root)
  const rootReal = await realpathOrNull(rootResolved) || rootResolved
  const allowedRoots = [...new Set([rootResolved, rootReal])]
  const restorePlan: Array<{ rel: string; absolute: string; content: string }> = []
  const deletePlan: Array<{ rel: string; absolute: string }> = []
  const violations: string[] = []
  const rollbackEntries = Array.isArray(applyResult?.rollback) ? [...applyResult.rollback].reverse() : []
  for (const entry of rollbackEntries) {
    const rel = normalizeRelPath(entry?.path || '')
    if (!rel || PROTECTED_PATH_RE.test(rel)) {
      violations.push(`rollback_invalid_path:${rel || 'missing'}`)
      continue
    }
    const absolute = path.resolve(root, rel)
    if (!absolute.startsWith(rootResolved + path.sep)) {
      violations.push(`rollback_path_outside_root:${rel}`)
      continue
    }
    const parent = path.dirname(absolute)
    const parentReal = await realpathOrNull(parent)
    if (parentReal && !isInsideAnyRoot(parentReal, allowedRoots)) {
      violations.push(`rollback_parent_symlink_outside_root:${rel}`)
      continue
    }
    const currentExists = await exists(absolute)
    const currentReal = currentExists ? await realpathOrNull(absolute) : null
    if (currentReal && !isInsideAnyRoot(currentReal, allowedRoots)) {
      violations.push(`rollback_target_symlink_outside_root:${rel}`)
      continue
    }
    if (entry?.sha256_after) {
      if (currentExists) {
        const currentHash = sha256(await fs.readFile(absolute, 'utf8'))
        if (currentHash !== entry.sha256_after) {
          violations.push(`rollback_hash_mismatch:${rel}`)
          continue
        }
      } else if (entry.existed) {
        violations.push(`rollback_target_missing:${rel}`)
        continue
      }
    } else {
      violations.push(`rollback_missing_after_hash:${rel}`)
      continue
    }
    if (entry.existed) {
      restorePlan.push({ rel, absolute, content: String(entry.content_before || '') })
    } else {
      deletePlan.push({ rel, absolute })
    }
  }
  if (violations.length === 0 && !opts.dryRun) {
    for (const plan of restorePlan) {
      await ensureDir(path.dirname(plan.absolute))
      await fs.writeFile(plan.absolute, plan.content, 'utf8')
    }
    for (const plan of deletePlan) {
      if (await exists(plan.absolute)) await fs.unlink(plan.absolute)
    }
  }
  return {
    schema: AGENT_PATCH_ROLLBACK_SCHEMA,
    ok: violations.length === 0,
    status: violations.length === 0 ? opts.dryRun ? 'dry_run' : 'rolled_back' : 'blocked',
    restored_files: violations.length === 0 ? [...new Set(restorePlan.map((plan) => plan.rel))] : [],
    deleted_files: violations.length === 0 ? [...new Set(deletePlan.map((plan) => plan.rel))] : [],
    rollback_digest: sha256(JSON.stringify(rollbackEntries.map((entry) => ({ path: normalizeRelPath(entry?.path || ''), existed: Boolean(entry?.existed), sha256_before: entry?.sha256_before || null })))),
    violations
  }
}

async function journalApplyFinished(journal: AgentPatchTransactionJournal | null, entryId: string, applyResult: any): Promise<void> {
  if (!journal) return
  await journal.append({
    event_type: 'apply_finished',
    entry_id: entryId,
    agent_id: applyResult.agent_id || null,
    lease_id: applyResult.lease_id || null,
    status: applyResult.status || null,
    before_hashes: applyResult.before_hashes || {},
    after_hashes: applyResult.after_hashes || {},
    changed_files: applyResult.changed_files || [],
    rollback_digest: applyResult.rollback_digest || null,
    verification_status: applyResult.verification?.status || null,
    duration_ms: applyResult.latency_ms || 0,
    violations: applyResult.violations || []
  })
}

function result(ok: boolean, changedFiles: string[], rollback: any[], violations: string[], dryRun: boolean, startedAt: string, startedMs: number, envelope: AgentPatchEnvelope, beforeHashesByPath: Record<string, string>, entryId?: string) {
  const endedAt = nowIso()
  return {
    schema: AGENT_PATCH_APPLY_SCHEMA,
    ...(entryId ? { entry_id: entryId } : {}),
    agent_id: envelope.agent_id,
    lease_id: envelope.lease_id || envelope.lease_proof?.lease_id || null,
    ok,
    status: ok ? dryRun ? 'dry_run' : 'applied' : 'blocked',
    dry_run: dryRun,
    apply_started_at: startedAt,
    apply_ended_at: endedAt,
    latency_ms: Math.max(0, Date.now() - startedMs),
    changed_files: [...new Set(changedFiles)],
    rollback,
    rollback_digest: sha256(JSON.stringify(rollback.map((entry) => ({ path: entry.path, existed: entry.existed, sha256_before: entry.sha256_before })))),
    before_hashes: beforeHashesByPath,
    after_hashes: Object.fromEntries(rollback.map((entry) => [entry.path, entry.sha256_after])),
    verification: {
      status: ok ? dryRun ? 'dry_run_verified' : 'applied_hashes_recorded' : 'blocked',
      changed_file_count: changedFiles.length,
      hint: envelope.verification_hint || null,
      checks: [dryRun ? 'patch-dry-run' : 'patch-apply', 'hashes-recorded']
    },
    rollback_hint: envelope.rollback_hint || null,
    violations
  }
}

async function writeResultArtifact(resultValue: ReturnType<typeof result>, opts: { artifactsDir?: string; entryId?: string }) {
  if (opts.artifactsDir && opts.entryId) {
    await writeJsonAtomic(path.join(opts.artifactsDir, `agent-patch-apply-result-${opts.entryId}.json`), resultValue)
  }
  return resultValue
}

function normalizeRelPath(value: string): string {
  const normalized = path.posix.normalize(String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, ''))
  return normalized === '.' ? '' : normalized
}

async function realpathOrNull(file: string): Promise<string | null> {
  try {
    return await fs.realpath(file)
  } catch {
    return null
  }
}

function isInsideAnyRoot(file: string, roots: string[]): boolean {
  const resolved = path.resolve(file)
  return roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`))
}

function beforeHashes(buffers: Map<string, { beforeExists: boolean; before: string }>): Record<string, string> {
  return Object.fromEntries([...buffers.entries()].map(([rel, state]) => [rel, state.beforeExists ? sha256(state.before) : 'missing']))
}

function pathAllowedByLease(operationPath: string, envelope: AgentPatchEnvelope): boolean {
  const allowedPaths = envelope.lease_proof?.allowed_paths
  if (!allowedPaths?.length) return true
  const rel = normalizeRelPath(operationPath)
  return allowedPaths.map(normalizeRelPath).some((allowed) => rel === allowed || rel.startsWith(`${allowed}/`))
}

async function acquireFileLock(absolute: string, artifactsDir?: string): Promise<{ ok: boolean; lockFile?: string }> {
  if (activeFileLocks.has(absolute)) return { ok: false }
  activeFileLocks.add(absolute)
  if (!artifactsDir) return { ok: true }
  const lockDir = path.join(artifactsDir, 'agent-patch-locks')
  const lockFile = path.join(lockDir, `${sha256(absolute)}.lock`)
  try {
    await ensureDir(lockDir)
    const handle = await fs.open(lockFile, 'wx')
    try {
      await handle.writeFile(`${process.pid} ${absolute}\n`, 'utf8')
    } finally {
      await handle.close().catch(() => {})
    }
    return { ok: true, lockFile }
  } catch {
    activeFileLocks.delete(absolute)
    return { ok: false, lockFile }
  }
}

async function releaseFileLock(absolute: string, lockFile?: string): Promise<void> {
  activeFileLocks.delete(absolute)
  if (lockFile) await fs.rm(lockFile, { force: true }).catch(() => {})
}

function applyUnifiedDiffPatch(text: string, diff: string): { ok: boolean; text: string } {
  const hunks = parseUnifiedDiffHunks(diff)
  if (!hunks.length) return applyLooseUnifiedDiffPatch(text, diff)
  const hadTrailingNewline = text.endsWith('\n')
  const lines = text.split('\n')
  if (hadTrailingNewline) lines.pop()
  let offset = 0
  for (const hunk of hunks) {
    const start = Math.max(0, hunk.oldStart === 0 ? 0 : hunk.oldStart - 1 + offset)
    let cursor = start
    const replacement: string[] = []
    for (const line of hunk.lines) {
      if (line.kind === 'context') {
        if (lines[cursor] !== line.value) return { ok: false, text }
        replacement.push(line.value)
        cursor += 1
      } else if (line.kind === 'remove') {
        if (lines[cursor] !== line.value) return { ok: false, text }
        cursor += 1
      } else {
        replacement.push(line.value)
      }
    }
    lines.splice(start, cursor - start, ...replacement)
    offset += replacement.length - (cursor - start)
  }
  return { ok: true, text: lines.join('\n') + (hadTrailingNewline ? '\n' : '') }
}

function parseUnifiedDiffHunks(diff: string): Array<{ oldStart: number; lines: Array<{ kind: 'context' | 'remove' | 'add'; value: string }> }> {
  const rows = String(diff || '').replace(/\r\n/g, '\n').split('\n')
  const hunks: Array<{ oldStart: number; lines: Array<{ kind: 'context' | 'remove' | 'add'; value: string }> }> = []
  let current: { oldStart: number; lines: Array<{ kind: 'context' | 'remove' | 'add'; value: string }> } | null = null
  for (const row of rows) {
    const header = row.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
    if (header) {
      current = { oldStart: Number(header[1]), lines: [] }
      hunks.push(current)
      continue
    }
    if (!current) continue
    if (row.startsWith('\\')) continue
    if (row.startsWith(' ')) current.lines.push({ kind: 'context', value: row.slice(1) })
    else if (row.startsWith('-')) current.lines.push({ kind: 'remove', value: row.slice(1) })
    else if (row.startsWith('+')) current.lines.push({ kind: 'add', value: row.slice(1) })
    else if (row !== '') return []
  }
  return hunks.filter((hunk) => hunk.lines.length > 0)
}

function applyLooseUnifiedDiffPatch(text: string, diff: string): { ok: boolean; text: string } {
  const removed: string[] = []
  const added: string[] = []
  for (const line of String(diff || '').split(/\n/)) {
    if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('@@')) continue
    if (line.startsWith('-')) removed.push(line.slice(1))
    if (line.startsWith('+')) added.push(line.slice(1))
  }
  if (!removed.length && !added.length) return { ok: false, text }
  const oldBlock = removed.join('\n') + (removed.length ? '\n' : '')
  const newBlock = added.join('\n') + (added.length ? '\n' : '')
  if (oldBlock && text.includes(oldBlock)) return { ok: true, text: text.replace(oldBlock, newBlock) }
  if (removed.length === 1 && text.includes(removed[0] || '')) return { ok: true, text: text.replace(removed[0] || '', added[0] || '') }
  return { ok: oldBlock.length === 0, text: oldBlock.length === 0 ? text + newBlock : text }
}

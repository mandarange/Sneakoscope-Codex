import path from 'node:path'
import { normalizeAgentPatchEnvelope, validateAgentPatchEnvelope, type AgentPatchEnvelope, type AgentPatchOperation } from '../agents/agent-patch-schema.js'
import { ensureDir, readText, sha256, writeTextAtomic } from '../fsx.js'
import { envelopeIdFor, planNarutoPatchTransactionBatches } from './naruto-patch-transaction-batch.js'

export interface NarutoParallelPatchApplyResult {
  schema: 'sks.naruto-parallel-patch-apply.v1'
  ok: boolean
  dry_run: boolean
  batch_count: number
  parallel_apply_count: number
  conflicts: ReturnType<typeof planNarutoPatchTransactionBatches>['conflicts']
  results: Array<{
    envelope_id: string
    ok: boolean
    changed_files: string[]
    before_hashes: Record<string, string>
    after_hashes: Record<string, string>
    rollback: Array<{ path: string; content: string }>
    blockers: string[]
  }>
  blockers: string[]
}

export async function applyNarutoPatchEnvelopes(root: string, rawEnvelopes: unknown[], opts: { dryRun?: boolean } = {}): Promise<NarutoParallelPatchApplyResult> {
  const dryRun = opts.dryRun === true
  const envelopes = rawEnvelopes.map(normalizeAgentPatchEnvelope)
  const plan = planNarutoPatchTransactionBatches(envelopes)
  const results: NarutoParallelPatchApplyResult['results'] = []
  for (const batch of plan.batches) {
    const batchEnvelopes = envelopes.filter((envelope) => batch.envelope_ids.includes(envelopeIdFor(envelope)))
    const batchResults = await Promise.all(batchEnvelopes.map((envelope) => applyEnvelope(root, envelope, dryRun)))
    results.push(...batchResults)
  }
  const blockers = [
    ...plan.conflicts.map((conflict) => `naruto_patch_conflict:${conflict.envelope_id}`),
    ...results.flatMap((result) => result.blockers)
  ]
  return {
    schema: 'sks.naruto-parallel-patch-apply.v1',
    ok: blockers.length === 0,
    dry_run: dryRun,
    batch_count: plan.batches.length,
    parallel_apply_count: plan.batches.filter((batch) => batch.envelope_ids.length > 1).length,
    conflicts: plan.conflicts,
    results,
    blockers
  }
}

async function applyEnvelope(root: string, envelope: AgentPatchEnvelope, dryRun: boolean): Promise<NarutoParallelPatchApplyResult['results'][number]> {
  const validation = validateAgentPatchEnvelope(envelope)
  const beforeHashes: Record<string, string> = {}
  const afterHashes: Record<string, string> = {}
  const rollback: Array<{ path: string; content: string }> = []
  const changedFiles: string[] = []
  const blockers = [...validation.violations]
  if (!validation.ok) {
    return { envelope_id: envelopeIdFor(envelope), ok: false, changed_files: [], before_hashes: {}, after_hashes: {}, rollback: [], blockers }
  }
  for (const operation of envelope.operations) {
    const target = resolvePatchPath(root, operation.path)
    const before = await readText(target, '')
    beforeHashes[operation.path] = sha256(String(before))
    rollback.push({ path: operation.path, content: String(before) })
    const after = applyOperation(String(before), operation)
    afterHashes[operation.path] = sha256(after)
    if (after !== before) {
      changedFiles.push(operation.path)
      if (!dryRun) {
        await ensureDir(path.dirname(target))
        await writeTextAtomic(target, after)
      }
    }
  }
  return {
    envelope_id: envelopeIdFor(envelope),
    ok: blockers.length === 0,
    changed_files: changedFiles,
    before_hashes: beforeHashes,
    after_hashes: afterHashes,
    rollback,
    blockers
  }
}

export async function rollbackNarutoPatchResult(root: string, result: NarutoParallelPatchApplyResult['results'][number]): Promise<{ ok: boolean; restored: string[]; blockers: string[] }> {
  const restored: string[] = []
  const blockers: string[] = []
  for (const entry of result.rollback) {
    try {
      const target = resolvePatchPath(root, entry.path)
      await ensureDir(path.dirname(target))
      await writeTextAtomic(target, entry.content)
      restored.push(entry.path)
    } catch (error: unknown) {
      blockers.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { ok: blockers.length === 0, restored, blockers }
}

function applyOperation(before: string, operation: AgentPatchOperation): string {
  if (operation.op === 'write') return String(operation.content || '')
  if (operation.op === 'replace') return before.replace(String(operation.search || ''), String(operation.replace || ''))
  return before
}

function resolvePatchPath(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath)
  const base = path.resolve(root)
  if (resolved !== base && !resolved.startsWith(base + path.sep)) throw new Error(`patch path escapes root: ${relativePath}`)
  return resolved
}

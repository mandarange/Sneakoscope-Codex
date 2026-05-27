import fs from 'node:fs/promises'
import path from 'node:path'
import { ensureDir, exists, sha256 } from '../fsx.js'
import { validateAgentPatchEnvelope, type AgentPatchEnvelope } from './agent-patch-schema.js'

export const AGENT_PATCH_APPLY_SCHEMA = 'sks.agent-patch-apply-result.v1'
export const AGENT_PATCH_ROLLBACK_SCHEMA = 'sks.agent-patch-rollback-result.v1'

const PROTECTED_PATH_RE = /^(?:\.codex\/|\.agents\/skills\/|\.codex\/agents\/|AGENTS\.md$|node_modules\/sneakoscope\/|\.sneakoscope\/.*policy.*\.json$)/

export async function applyAgentPatchEnvelope(root: string, envelope: AgentPatchEnvelope, opts: { dryRun?: boolean } = {}) {
  const validation = validateAgentPatchEnvelope(envelope)
  const violations = [...validation.violations]
  if (!validation.ok) {
    return result(false, [], [], violations, opts.dryRun === true)
  }
  const rootResolved = path.resolve(root)
  const buffers = new Map<string, { absolute: string; beforeExists: boolean; before: string; after: string }>()

  for (const operation of envelope.operations) {
    const rel = normalizeRelPath(operation.path)
    if (PROTECTED_PATH_RE.test(rel)) {
      violations.push(`protected_path:${rel}`)
      continue
    }
    const absolute = path.resolve(root, rel)
    if (!absolute.startsWith(rootResolved + path.sep)) {
      violations.push(`path_outside_root:${rel}`)
      continue
    }
    if (!buffers.has(rel)) {
      const beforeExists = await exists(absolute)
      const before = beforeExists ? await fs.readFile(absolute, 'utf8') : ''
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
    } else {
      state.after = String(operation.content || '')
    }
  }
  if (violations.length > 0) {
    return result(false, [], [], violations, opts.dryRun === true)
  }
  const plans = [...buffers.entries()].filter(([, state]) => state.before !== state.after || !state.beforeExists)
  const changedFiles = plans.map(([rel]) => rel)
  const rollback = plans.map(([rel, state]) => ({
    path: rel,
    existed: state.beforeExists,
    sha256_before: state.beforeExists ? sha256(state.before) : null,
    content_before: state.beforeExists ? state.before : null
  }))
  if (!opts.dryRun) {
    for (const [, state] of plans) {
      await ensureDir(path.dirname(state.absolute))
      await fs.writeFile(state.absolute, state.after, 'utf8')
    }
  }
  return result(true, changedFiles, rollback, violations, opts.dryRun === true)
}

export async function rollbackAgentPatchApply(root: string, applyResult: any, opts: { dryRun?: boolean } = {}) {
  const rootResolved = path.resolve(root)
  const restored: string[] = []
  const deleted: string[] = []
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
    if (entry.existed) {
      if (!opts.dryRun) {
        await ensureDir(path.dirname(absolute))
        await fs.writeFile(absolute, String(entry.content_before || ''), 'utf8')
      }
      restored.push(rel)
    } else {
      if (!opts.dryRun && await exists(absolute)) await fs.unlink(absolute)
      deleted.push(rel)
    }
  }
  return {
    schema: AGENT_PATCH_ROLLBACK_SCHEMA,
    ok: violations.length === 0,
    status: violations.length === 0 ? opts.dryRun ? 'dry_run' : 'rolled_back' : 'blocked',
    restored_files: [...new Set(restored)],
    deleted_files: [...new Set(deleted)],
    rollback_digest: sha256(JSON.stringify(rollbackEntries.map((entry) => ({ path: normalizeRelPath(entry?.path || ''), existed: Boolean(entry?.existed), sha256_before: entry?.sha256_before || null })))),
    violations
  }
}

function result(ok: boolean, changedFiles: string[], rollback: any[], violations: string[], dryRun: boolean) {
  return {
    schema: AGENT_PATCH_APPLY_SCHEMA,
    ok,
    status: ok ? dryRun ? 'dry_run' : 'applied' : 'blocked',
    changed_files: [...new Set(changedFiles)],
    rollback,
    rollback_digest: sha256(JSON.stringify(rollback.map((entry) => ({ path: entry.path, existed: entry.existed, sha256_before: entry.sha256_before })))),
    violations
  }
}

function normalizeRelPath(value: string): string {
  const normalized = path.posix.normalize(String(value || '').replace(/\\/g, '/').replace(/^\.\/+/, ''))
  return normalized === '.' ? '' : normalized
}

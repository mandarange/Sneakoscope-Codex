import path from 'node:path'
import { ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { cardBodyHash, loadDeployedSnapshot, skillDir, validateCardShape } from './core-skill-card.js'
import type { CoreSkillCard } from './core-skill-types.js'
import { evaluateMutation, recordMutation } from '../safety/mutation-ledger.js'
import type { RequestedScopeContract } from '../safety/requested-scope-contract.js'

export interface PromotionMutationOptions {
  contract?: RequestedScopeContract
  confirmed?: boolean
  context?: 'release' | string
  ledgerRoot?: string
}

export class SkillDeploymentViolationError extends Error {
  constructor(fnName: string) {
    super(`optimizer call '${fnName}' is forbidden in deployment/inference context`)
    this.name = 'SkillDeploymentViolationError'
  }
}

let DEPLOYMENT_CONTEXT = false

export function setDeploymentContext(active: boolean): void {
  DEPLOYMENT_CONTEXT = active === true
}

export function isDeploymentContext(): boolean {
  return DEPLOYMENT_CONTEXT || process.env.SKS_SKILL_DEPLOYMENT_CONTEXT === '1'
}

/**
 * Guard invoked at the entry of every optimizer/epoch function. In a
 * deployment/inference context the optimizer must never run — only the deployed
 * snapshot is read. Throws to make any accidental call a hard failure.
 */
export function assertNotInDeployment(fnName: string): void {
  if (isDeploymentContext()) throw new SkillDeploymentViolationError(fnName)
}

export const readDeploymentSnapshot = loadDeployedSnapshot

/**
 * Primary release/deployment promotion API. It writes the immutable deployed
 * snapshot and treats the side-effect ledger as part of the transaction: when
 * ledger recording fails, the deployed pointer is rolled back or removed.
 */
export async function promoteToDeployedWithLedger(root: string, accepted: CoreSkillCard, opts: PromotionMutationOptions & { contract: RequestedScopeContract }): Promise<{ ok: boolean; blockers: string[]; snapshot: CoreSkillCard | null; archived_path: string | null }> {
  return promoteToDeployedInternal(root, accepted, opts, true)
}

export async function promoteToDeployedLegacyForCompatibility(root: string, accepted: CoreSkillCard): Promise<{ ok: boolean; blockers: string[]; snapshot: CoreSkillCard | null; archived_path: string | null }> {
  return promoteToDeployedInternal(root, accepted, {}, false)
}

export async function promoteToDeployed(root: string, accepted: CoreSkillCard, opts: PromotionMutationOptions = {}): Promise<{ ok: boolean; blockers: string[]; snapshot: CoreSkillCard | null; archived_path: string | null }> {
  if (opts.contract) return promoteToDeployedWithLedger(root, accepted, opts as PromotionMutationOptions & { contract: RequestedScopeContract })
  return promoteToDeployedLegacyForCompatibility(root, accepted)
}

async function promoteToDeployedInternal(root: string, accepted: CoreSkillCard, opts: PromotionMutationOptions, ledgerRequired: boolean): Promise<{ ok: boolean; blockers: string[]; snapshot: CoreSkillCard | null; archived_path: string | null }> {
  const blockers: string[] = []
  if (accepted.status !== 'accepted') blockers.push('promote_requires_accepted_status')
  const shape = validateCardShape(accepted)
  if (!shape.ok) blockers.push(...shape.blockers)
  if (blockers.length) return { ok: false, blockers, snapshot: null, archived_path: null }

  const dir = skillDir(root, accepted.route, accepted.skill_id)
  await ensureDir(dir)
  const deployedPath = path.join(dir, 'deployed.json')
  let archivedPath: string | null = null
  const existing = (await readJson(deployedPath, null)) as CoreSkillCard | null
  if (existing) {
    // Archive previous snapshot for rollback before overwriting.
    const historyDir = path.join(dir, 'deployed-history')
    await ensureDir(historyDir)
    archivedPath = path.join(historyDir, `v${existing.version}.json`)
    await writeJsonAtomic(archivedPath, existing)
    // A changed snapshot body requires a strictly higher version.
    if (cardBodyHash(existing.body) !== cardBodyHash(accepted.body) && accepted.version <= existing.version) {
      return { ok: false, blockers: ['snapshot_changed_without_version_increment'], snapshot: null, archived_path: archivedPath }
    }
  }
  const snapshot: CoreSkillCard = {
    ...accepted,
    status: 'deployed',
    deployment_snapshot: true,
    body_hash: cardBodyHash(accepted.body),
    created_at: nowIso()
  }
  await writeJsonAtomic(deployedPath, snapshot)
  if (ledgerRequired) {
    if (!opts.contract) {
      await rollbackPromotionWrite(deployedPath, existing)
      return { ok: false, blockers: ['promotion_ledger_contract_required'], snapshot: null, archived_path: archivedPath }
    }
    try {
      const entry = evaluateMutation(opts.contract, 'skill_snapshot_promotion', {
        target: deployedPath,
        confirmed: true,
        backupPath: archivedPath,
        noOpReason: archivedPath ? null : 'first_deploy_no_previous_snapshot',
        applied: true
      })
      if (entry.violation) {
        await rollbackPromotionWrite(deployedPath, existing)
        return { ok: false, blockers: [`promotion_ledger_violation:${entry.reason || 'unknown'}`], snapshot: null, archived_path: archivedPath }
      }
      await recordMutation(opts.ledgerRoot || root, entry)
    } catch (err) {
      await rollbackPromotionWrite(deployedPath, existing)
      const message = err instanceof Error ? err.message : String(err)
      return { ok: false, blockers: [`promotion_ledger_write_failed:${message}`], snapshot: null, archived_path: archivedPath }
    }
  }
  return { ok: true, blockers: [], snapshot, archived_path: archivedPath }
}

async function rollbackPromotionWrite(deployedPath: string, existing: CoreSkillCard | null): Promise<void> {
  if (existing) await writeJsonAtomic(deployedPath, existing)
  else {
    try {
      const fsp = await import('node:fs/promises')
      await fsp.rm(deployedPath, { force: true })
    } catch {}
  }
}

export async function rollbackDeployment(root: string, route: string, skillId: string): Promise<{ ok: boolean; restored_version: number | null }> {
  const dir = skillDir(root, route, skillId)
  const historyDir = path.join(dir, 'deployed-history')
  const current = await loadDeployedSnapshot(root, route, skillId)
  if (!current) return { ok: false, restored_version: null }
  // Find the highest-versioned archived snapshot below the current version.
  let restore: CoreSkillCard | null = null
  for (let v = current.version - 1; v >= 1; v -= 1) {
    const candidate = (await readJson(path.join(historyDir, `v${v}.json`), null)) as CoreSkillCard | null
    if (candidate) {
      restore = candidate
      break
    }
  }
  if (!restore) return { ok: false, restored_version: null }
  await writeJsonAtomic(path.join(dir, 'deployed.json'), { ...restore, status: 'deployed', deployment_snapshot: true, body_hash: cardBodyHash(restore.body) })
  return { ok: true, restored_version: restore.version }
}

export async function hasRollbackSnapshot(root: string, route: string, skillId: string): Promise<boolean> {
  const current = await loadDeployedSnapshot(root, route, skillId)
  if (!current) return false
  for (let v = current.version - 1; v >= 1; v -= 1) {
    if (await exists(path.join(skillDir(root, route, skillId), 'deployed-history', `v${v}.json`))) return true
  }
  return false
}

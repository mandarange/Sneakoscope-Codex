import path from 'node:path'
import { ensureDir, exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { cardBodyHash, loadDeployedSnapshot, skillDir, validateCardShape } from './core-skill-card.js'
import type { CoreSkillCard } from './core-skill-types.js'

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
 * Promote an accepted candidate to an immutable deployed snapshot. The previous
 * snapshot is archived for rollback. Deployed snapshots are never edited in place.
 */
export async function promoteToDeployed(root: string, accepted: CoreSkillCard): Promise<{ ok: boolean; blockers: string[]; snapshot: CoreSkillCard | null; archived_path: string | null }> {
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
  return { ok: true, blockers: [], snapshot, archived_path: archivedPath }
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

import fs from 'node:fs'
import path from 'node:path'
import { codexHomePath } from '../codex-app/codex-model-catalog.js'
import {
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  managedOfficialSubagentRoleByName,
  managedOfficialSubagentRoleOwnsText,
  type ManagedOfficialSubagentRole
} from '../managed-assets/managed-assets-manifest.js'
import { catalogIsAuthoritative, compareModelVersions, parseGptModelId } from './model-tiers.js'

/**
 * Managed role files pin a tier model, and Codex runs a role file's model even
 * when the spawn names another. A pin written while an older generation was the
 * newest therefore keeps running that generation after Codex lists a newer one
 * unless something notices. These helpers read the pins without writing, so the
 * spawn gate can refuse a stale role and the prompt preflight can refresh it.
 * Only a pin that is OLDER than the role's current model is stale: a newer pin
 * (the cache briefly listing fewer models) is never rewritten downward.
 */

/** The top-level `model = "..."` of a role file, read before its instructions. */
export function pinnedModelOfRoleFile(text: string): string | null {
  const source = String(text || '')
  const head = source.slice(0, Math.max(0, source.indexOf('developer_instructions')) || source.length)
  return /^model\s*=\s*"([^"]*)"\s*$/m.exec(head)?.[1] ?? null
}

export interface StaleRolePin {
  role: string
  file: string
  pinned: string
  current: string
}

type RolePin = { state: 'missing' } | { state: 'foreign' } | { state: 'owned'; pinned: string | null }

function readRolePin(file: string, role: ManagedOfficialSubagentRole): RolePin {
  let text: string
  try {
    text = fs.readFileSync(file, 'utf8')
  } catch {
    return { state: 'missing' }
  }
  // A user-edited or user-written file is theirs: only SKS-owned files count.
  return managedOfficialSubagentRoleOwnsText(text, role)
    ? { state: 'owned', pinned: pinnedModelOfRoleFile(text) }
    : { state: 'foreign' }
}

/** A pin differing from the role's current model is stale unless it is a newer version of the same family. */
function pinIsStale(pinned: string, current: string): boolean {
  if (pinned === current) return false
  const a = parseGptModelId(pinned)
  const b = parseGptModelId(current)
  return !(a && b && a.family === b.family && compareModelVersions(a.version, b.version) > 0)
}

/** The project agents directory (when a root is given) and the Codex-home one, project first. */
function roleAgentDirs(input: { root?: string; env?: NodeJS.ProcessEnv; globalOnly?: boolean }): string[] {
  const home = path.join(codexHomePath({ env: input.env ?? process.env }), 'agents')
  return input.globalOnly || !input.root ? [home] : [path.join(path.resolve(input.root), '.codex', 'agents'), home]
}

/**
 * The stale pin Codex would run for `agentType`. The project file wins over the
 * Codex-home file, as Codex layers them: a user-owned project file is the layer
 * that applies and is never judged, and a missing one defers to the home file.
 */
export function stalePinForAgentType(
  agentType: string,
  input: { root: string; env?: NodeJS.ProcessEnv }
): StaleRolePin | null {
  const role = managedOfficialSubagentRoleByName(String(agentType || '').trim())
  if (!role) return null
  // Without Codex's models cache "current" is only a built-in guess.
  if (!catalogIsAuthoritative({ env: input.env ?? process.env })) return null
  for (const dir of roleAgentDirs(input)) {
    const file = path.join(dir, role.filename)
    const pin = readRolePin(file, role)
    if (pin.state === 'missing') continue
    if (pin.state === 'foreign' || pin.pinned === null) return null
    return pinIsStale(pin.pinned, role.model) ? { role: role.codex_name, file, pinned: pin.pinned, current: role.model } : null
  }
  return null
}

/** Every managed role whose SKS-owned file, in the project or the Codex home, pins an older model than the role's current one. */
export function staleManagedRolePins(input: { root?: string; env?: NodeJS.ProcessEnv; globalOnly?: boolean }): StaleRolePin[] {
  if (!catalogIsAuthoritative({ env: input.env ?? process.env })) return []
  const stale = new Map<string, StaleRolePin>()
  for (const dir of roleAgentDirs(input)) {
    for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
      const file = path.join(dir, role.filename)
      const pin = readRolePin(file, role)
      if (pin.state === 'owned' && pin.pinned !== null && pinIsStale(pin.pinned, role.model)) {
        stale.set(file, { role: role.codex_name, file, pinned: pin.pinned, current: role.model })
      }
    }
  }
  return [...stale.values()]
}

/**
 * Rewrite the stale SKS-owned role files through the normal installers, which
 * touch only files whose marker, id and body hash still match, and only files
 * that already exist. Nothing is written when no pin is stale. `remaining` is
 * what is still stale afterwards (a symlinked or unwritable directory).
 * Loaded lazily: the installers are large and a hook reaches this at most once
 * per change of the newest models.
 */
export async function refreshStaleManagedRolePins(input: { root?: string; env?: NodeJS.ProcessEnv; globalOnly?: boolean }): Promise<{ stale: number; updated: string[]; remaining: number }> {
  const stale = staleManagedRolePins(input)
  if (!stale.length) return { stale: 0, updated: [], remaining: 0 }
  const dirs = roleAgentDirs(input)
  const globalDir = dirs[dirs.length - 1] as string
  const projectDir = dirs.length > 1 ? (dirs[0] as string) : null
  const config = await import('./official-subagent-config.js')
  const updated: string[] = []
  if (input.root && projectDir && stale.some((entry) => entry.file.startsWith(projectDir + path.sep))) {
    updated.push(...(await config.installOfficialSubagentAgentConfigs(input.root, { apply: true, existingOnly: true })).updated)
  }
  if (projectDir !== globalDir && stale.some((entry) => entry.file.startsWith(globalDir + path.sep))) {
    updated.push(...(await config.refreshGlobalOfficialSubagentAgentConfigs(path.dirname(globalDir), { apply: true })).updated)
  }
  return { stale: stale.length, updated, remaining: staleManagedRolePins(input).length }
}

/** The reason a spawn naming a role with a stale pin is refused. */
export function stalePinBlockReason(stale: StaleRolePin): string {
  return `SKS role "${stale.role}" pins ${stale.pinned} in ${stale.file}, but its current model is ${stale.current}. Codex runs a role file's pinned model over the spawn's model, so this child would not use the latest model. SKS refreshes its own role files before a spawn, so this role file could not be refreshed: ask the user to run \`sks doctor --fix\` in their own terminal, then retry.`
}

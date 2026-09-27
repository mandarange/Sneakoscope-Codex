import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { writeTextAtomic } from '../fsx.js'
import {
  MANAGED_ASSET_SCHEMA_VERSION,
  MANAGED_OFFICIAL_SUBAGENT_MARKER,
  managedOfficialSubagentFileContent,
  managedOfficialSubagentFileOwnsText
} from '../managed-assets/managed-assets-manifest.js'

/**
 * The read-only child role for OpenRouter Only Mode.
 *
 * Every managed role file pins a tier `model`, and Codex will not let a spawn
 * change a role's pinned model, so list-mode spawns cannot pass those roles as
 * `agent_type`. Write roles set no sandbox and lose nothing without one, but
 * read-only roles would silently inherit the parent's sandbox. This role keeps
 * `sandbox_mode = "read-only"` and pins no model or effort, so a read-only
 * slice spawns with it plus the list model. SKS installs it in the project's
 * `.codex/agents/` while the mode is on, and in `~/.codex/agents/` (loaded for
 * every project) when the mode is turned on; the role catalog never offers it.
 */

export const READ_ONLY_LIST_ROLE = Object.freeze({
  id: 'sks-official-read-only-list-child',
  filename: 'read-only-list-child.toml',
  codex_name: 'read_only_list_child',
  description: 'Read-only child for OpenRouter Only Mode slices whose spawn contract names it; it keeps the read-only sandbox and pins no model, so the spawn model from the subagent list applies.',
  nickname_candidates: Object.freeze(['Lens', 'Prism', 'Quill', 'Tally']),
  developer_instructions: `You are a read-only child in OpenRouter Only Mode.

The parent's spawn message carries your role brief, slice, and done condition; follow it.
Stay read-only: do not edit files and do not spawn another subagent.
Separate evidence from inference and cite exact paths and symbols.
Return a concise result, evidence, risks, and blockers.`,
  ownership_marker: MANAGED_OFFICIAL_SUBAGENT_MARKER
})

export function readOnlyListRoleBody(): string {
  const role = READ_ONLY_LIST_ROLE
  return [
    `name = "${role.codex_name}"`,
    `description = "${role.description}"`,
    'sandbox_mode = "read-only"',
    '',
    'nickname_candidates = [',
    ...role.nickname_candidates.map((nickname) => `  "${nickname}",`),
    ']',
    '',
    'developer_instructions = """',
    role.developer_instructions,
    '"""',
    ''
  ].join('\n')
}

export function readOnlyListRoleContent(): string {
  return managedOfficialSubagentFileContent(READ_ONLY_LIST_ROLE.id, MANAGED_ASSET_SCHEMA_VERSION, readOnlyListRoleBody())
}

export function readOnlyListRoleOwnsText(text: string): boolean {
  return managedOfficialSubagentFileOwnsText(text, READ_ONLY_LIST_ROLE.id)
}

function ownedCopyAt(file: string): boolean {
  try {
    return readOnlyListRoleOwnsText(fs.readFileSync(file, 'utf8'))
  } catch {
    return false
  }
}

export function userReadOnlyListRolePath(home: string): string {
  return path.join(home, '.codex', 'agents', READ_ONLY_LIST_ROLE.filename)
}

/**
 * Whether Codex can load an SKS-owned copy for this project: the project's own
 * or the user-level one. Codex reads role files when a thread starts, so a
 * copy installed later needs a new thread.
 */
export function readOnlyListRoleInstalled(root: string, home: string = process.env.HOME || os.homedir()): boolean {
  return ownedCopyAt(path.join(root, '.codex', 'agents', READ_ONLY_LIST_ROLE.filename)) || ownedCopyAt(userReadOnlyListRolePath(home))
}

export type UserReadOnlyListRoleInstall = 'created' | 'updated' | 'unchanged' | 'preserved_user_file'

/**
 * Codex loads `<config folder>/agents` for every config layer, so the user
 * layer's copy serves every project. A file SKS does not own is never touched.
 */
export async function ensureUserReadOnlyListRole(home: string): Promise<UserReadOnlyListRoleInstall> {
  const file = userReadOnlyListRolePath(home)
  const expected = readOnlyListRoleContent()
  let current: string | null = null
  try {
    current = fs.readFileSync(file, 'utf8')
  } catch {
    current = null
  }
  if (current === expected) return 'unchanged'
  if (current !== null && !readOnlyListRoleOwnsText(current)) return 'preserved_user_file'
  await writeTextAtomic(file, expected)
  return current === null ? 'created' : 'updated'
}

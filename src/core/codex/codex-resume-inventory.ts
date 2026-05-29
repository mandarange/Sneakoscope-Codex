import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'

export const CODEX_RESUME_INVENTORY_SCHEMA = 'sks.codex-resume-inventory.v1'

export function buildCodexResumeInventory(input: {
  missionId?: string | null
  cwd?: string
  workspace?: string | null
  root?: string | null
  execSessions?: Array<Record<string, unknown>>
} = {}) {
  const cwd = path.resolve(input.cwd || process.cwd())
  const workspace = input.workspace ? path.resolve(input.workspace) : cwd
  const root = input.root ? path.resolve(input.root) : workspace
  const mismatch = cwd !== workspace || cwd !== root
  return {
    schema: CODEX_RESUME_INVENTORY_SCHEMA,
    generated_at: nowIso(),
    mission_id: input.missionId || null,
    cwd,
    workspace,
    root,
    non_interactive_exec_sessions: input.execSessions || [],
    non_interactive_exec_session_count: (input.execSessions || []).length,
    resume_cwd_mismatch: mismatch,
    cwd_override_mismatch_detected: mismatch,
    blockers: mismatch ? ['resume_cwd_mismatch'] : [],
    warnings: [] as string[]
  }
}

export async function writeCodexResumeInventory(root: string, input: Parameters<typeof buildCodexResumeInventory>[0] = {}) {
  const report = buildCodexResumeInventory(input)
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'codex-resume-inventory.json'), report)
  return report
}

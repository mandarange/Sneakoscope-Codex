import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import {
  MANAGED_AGENT_ROLES,
  managedAgentRoleByFile,
  managedAgentRoleByName,
  managedAgentRoleContent,
  managedAgentRoleOwnsText
} from '../managed-assets/managed-assets-manifest.js'

export const AGENT_ROLE_CONFIG_REPAIR_SCHEMA = 'sks.agent-role-config-repair.v1'

export const SKS_OWNED_AGENT_CONFIGS = new Map(MANAGED_AGENT_ROLES.map((role) => [
  role.filename,
  { name: role.codex_name, sandbox: role.sandbox, content: managedAgentRoleContent(role), id: role.id }
]))

export function managedAgentRoleConfigForFile(file: string): string | null {
  const role = managedAgentRoleByFile(file)
  return role ? managedAgentRoleContent(role) : null
}

export function managedAgentRoleConfigForRole(role: string): { file: string; content: string } | null {
  const match = managedAgentRoleByName(role)
  return match ? { file: match.filename, content: managedAgentRoleContent(match) } : null
}

export async function repairAgentRoleConfigs(input: {
  root: string
  apply?: boolean
  reportPath?: string
  codexHome?: string
}) {
  const root = path.resolve(input.root)
  const codexHome = input.codexHome || process.env.CODEX_HOME || path.join(process.env.HOME || '', '.codex')
  const candidates = [path.join(root, '.codex', 'agents'), path.join(codexHome, 'agents')]
  const missing: string[] = []
  const stale: string[] = []
  const created: string[] = []
  const repaired: string[] = []
  const existing: string[] = []
  const projectAgentsDir = path.join(root, '.codex', 'agents')
  for (const role of MANAGED_AGENT_ROLES) {
    const file = role.filename
    const content = managedAgentRoleContent(role)
    const foundPaths = candidates.map((dir) => path.join(dir, file)).filter((filePath) => fs.existsSync(filePath))
    let managedCopyFound = false
    for (const foundPath of foundPaths) {
      const text = fs.readFileSync(foundPath, 'utf8')
      if (isValidRoleConfig(text, role)) {
        managedCopyFound = true
        existing.push(path.relative(root, foundPath) || foundPath)
        continue
      }
      const projectOwnedByFilename = foundPath.startsWith(`${projectAgentsDir}${path.sep}`)
      if (!projectOwnedByFilename && !managedAgentRoleOwnsText(text, role)) continue
      managedCopyFound = true
      stale.push(file)
      if (input.apply) {
        await ensureDir(path.dirname(foundPath))
        await writeTextAtomic(foundPath, content)
        repaired.push(path.relative(root, foundPath) || foundPath)
      }
    }
    if (managedCopyFound) continue
    missing.push(file)
    if (input.apply) {
      const target = path.join(projectAgentsDir, file)
      await ensureDir(path.dirname(target))
      await writeTextAtomic(target, content)
      created.push(path.relative(root, target))
    }
  }
  const requiredFixes = missing.length + stale.length
  const appliedFixes = created.length + repaired.length
  const report = {
    schema: AGENT_ROLE_CONFIG_REPAIR_SCHEMA,
    generated_at: nowIso(),
    ok: input.apply ? requiredFixes === appliedFixes : true,
    apply: input.apply === true,
    missing,
    stale,
    existing,
    created,
    repaired,
    manifest_role_ids: MANAGED_AGENT_ROLES.map((role) => role.id),
    warnings_suppressed: true,
    blockers: input.apply && requiredFixes !== appliedFixes ? ['agent_role_config_repair_incomplete'] : []
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}

function isValidRoleConfig(text: string, role: { id: string; codex_name: string; sandbox: string }) {
  return managedAgentRoleOwnsText(text, role as any)
    && text.includes('description = "')
    && text.includes('developer_instructions = """')
    && !/^\s*(?:model|model_reasoning_effort)\s*=/m.test(text)
}

import fs from 'node:fs'
import path from 'node:path'
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { REQUIRED_CODEX_MODEL } from '../codex-model-guard.js'

export const AGENT_ROLE_CONFIG_REPAIR_SCHEMA = 'sks.agent-role-config-repair.v1'

const SKS_OWNED_AGENT_CONFIGS = new Map<string, { name: string; sandbox: 'read-only' | 'workspace-write'; content: string }>([
  ['analysis-scout.toml', roleConfig('analysis_scout', 'Read-only SKS analysis scout retained for stale Codex agent-role config repair.', 'read-only')],
  ['native-agent-intake.toml', roleConfig('native_agent', 'Read-only Team native agent for repository/docs/tests/API/risk slices.', 'read-only')],
  ['team-consensus.toml', roleConfig('team_consensus', 'Planning and debate specialist for SKS Team mode.', 'read-only')],
  ['implementation-worker.toml', roleConfig('implementation_worker', 'Implementation specialist for bounded SKS Team write sets.', 'workspace-write')],
  ['db-safety-reviewer.toml', roleConfig('db_safety_reviewer', 'Read-only database safety reviewer for SQL, migrations, Supabase, and rollback safety.', 'read-only')],
  ['qa-reviewer.toml', roleConfig('qa_reviewer', 'Strict read-only verification reviewer for correctness, regressions, and final evidence.', 'read-only')]
])

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
  for (const [file, config] of SKS_OWNED_AGENT_CONFIGS) {
    const found = candidates.find((dir) => fs.existsSync(path.join(dir, file)))
    if (found) {
      const foundPath = path.join(found, file)
      const text = fs.readFileSync(foundPath, 'utf8')
      if (isValidRoleConfig(text, config)) {
        existing.push(path.relative(root, foundPath) || foundPath)
        continue
      }
      stale.push(file)
      if (input.apply) {
        const target = foundPath.startsWith(path.join(root, '.codex', 'agents')) ? foundPath : path.join(root, '.codex', 'agents', file)
        await ensureDir(path.dirname(target))
        await writeTextAtomic(target, config.content)
        repaired.push(path.relative(root, target))
      }
      continue
    }
    missing.push(file)
    if (input.apply) {
      const target = path.join(root, '.codex', 'agents', file)
      await ensureDir(path.dirname(target))
      await writeTextAtomic(target, config.content)
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
    warnings_suppressed: true,
    blockers: input.apply && requiredFixes !== appliedFixes ? ['agent_role_config_repair_incomplete'] : []
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}

function roleConfig(name: string, description: string, sandbox: 'read-only' | 'workspace-write') {
  const content = [
    `name = "${name}"`,
    `description = "${description}"`,
    `model = "${REQUIRED_CODEX_MODEL}"`,
    'model_reasoning_effort = "medium"',
    `sandbox_mode = "${sandbox}"`,
    'approval_policy = "never"',
    'developer_instructions = """',
    `You are the SKS ${name} role.`,
    sandbox === 'read-only' ? 'Do not edit files.' : 'Only edit the bounded files assigned by the parent orchestrator.',
    'Return concise source-backed findings and LIVE_EVENT lines when applicable.',
    '"""',
    ''
  ].join('\n')
  return { name, sandbox, content }
}

function isValidRoleConfig(text: string, config: { name: string; sandbox: string }) {
  return text.includes(`name = "${config.name}"`)
    && text.includes('description = "')
    && text.includes(`model = "${REQUIRED_CODEX_MODEL}"`)
    && text.includes(`sandbox_mode = "${config.sandbox}"`)
    && text.includes('developer_instructions = """')
}

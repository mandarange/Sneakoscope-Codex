#!/usr/bin/env node
import fs from 'node:fs/promises'
import path from 'node:path'
import { buildCodexNativeFeatureMatrix } from '../core/codex-native/codex-native-feature-broker.js'
import { currentSksSkillName } from '../core/codex-native/sks-skill-paths.js'
import { installGlobalSkills } from '../core/init/skills.js'
import { MANAGED_SKILLS } from '../core/managed-assets/managed-assets-manifest.js'
import { createCodexNativeRuntimeFixture, withFixtureEnv } from './codex-native-runtime-e2e-fixture.js'

const fixture = await createCodexNativeRuntimeFixture({
  hook: 'approved',
  agentType: 'supported',
  appHandoff: true,
  imagePathExposure: true,
  mcpCandidates: true,
  codeModeWebSearch: true
})
await withFixtureEnv(fixture, async () => {
  await fs.mkdir(path.join(fixture.root, 'codex-home', 'skills', 'user-skill'), { recursive: true })
  await fs.writeFile(path.join(fixture.root, 'codex-home', 'skills', 'user-skill', 'SKILL.md'), '# user skill\n', 'utf8')
  await fs.mkdir(path.join(fixture.root, 'codex-home', 'agents'), { recursive: true })
  await fs.writeFile(path.join(fixture.root, 'codex-home', 'agents', 'user-role.toml'), 'name = "user-role"\n', 'utf8')
  const matrix = await buildCodexNativeFeatureMatrix({ root: fixture.root, mode: 'read-only' })
  assertGate(matrix.schema === 'sks.codex-native-feature-matrix.v1', 'broker matrix schema mismatch', matrix)
  assertGate(matrix.features.skill_sync.ok === false && matrix.features.agent_roles.ok === false, 'read-only matrix counted non-SKS managed assets', matrix)
  assertGate(!(await exists(path.join(fixture.root, '.agents', 'skills'))), 'read-only matrix created project skills')
  assertGate(!(await exists(path.join(fixture.root, '.codex', 'agents'))), 'read-only matrix created project agent roles')

  const projectSkills = path.join(fixture.root, '.agents', 'skills')
  for (const skill of MANAGED_SKILLS) {
    const name = currentSksSkillName(skill.id)
    await fs.mkdir(path.join(projectSkills, name), { recursive: true })
    await fs.writeFile(path.join(projectSkills, name, 'SKILL.md'), [
      '---',
      `name: ${name}`,
      'description: project residue fixture',
      '---',
      '',
      `<!-- BEGIN SKS MANAGED SKILL v-test name=${name} -->`,
      ''
    ].join('\n'), 'utf8')
  }
  const projectOnlyMatrix = await buildCodexNativeFeatureMatrix({ root: fixture.root, mode: 'read-only' })
  const projectOnlySkillSync = projectOnlyMatrix.probes.skill_sync as { ok?: boolean; managed_count?: number; missing_required?: string[] }
  assertGate(projectOnlySkillSync.ok === false, 'broker accepted project-only managed SKS residue as authoritative', projectOnlySkillSync)
  assertGate(projectOnlySkillSync.managed_count === 0, 'broker counted project-only managed SKS residue', projectOnlySkillSync)

  const globalInstall = await installGlobalSkills(fixture.env.HOME || '')
  assertGate(globalInstall.ok === true, 'fixture failed to install authoritative global SKS skills', globalInstall)
  const globalMatrix = await buildCodexNativeFeatureMatrix({ root: fixture.root, mode: 'read-only' })
  const globalSkillSync = globalMatrix.probes.skill_sync as { ok?: boolean; managed_count?: number; missing_required?: string[] }
  assertGate(globalSkillSync.ok === true, 'broker did not recognize current global managed SKS skills', globalSkillSync)
  assertGate(globalSkillSync.managed_count === MANAGED_SKILLS.length, 'broker managed skill count mismatch', globalSkillSync)
  assertGate(globalSkillSync.missing_required?.length === 0, 'broker still reports current global managed skills missing', globalSkillSync)
})
emitGate('codex-native:broker-read-only')

async function exists(file: string): Promise<boolean> {
  try {
    await fs.stat(file)
    return true
  } catch {
    return false
  }
}

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate }, null, 2))
}

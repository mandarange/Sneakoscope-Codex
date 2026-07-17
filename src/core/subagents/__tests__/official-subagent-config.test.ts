import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parse } from 'smol-toml'
import {
  MANAGED_OFFICIAL_SUBAGENT_ROLES,
  RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES,
  managedAgentRoleContent,
  managedOfficialSubagentRoleContent,
  managedOfficialSubagentRoleOwnsText
} from '../../managed-assets/managed-assets-manifest.js'
import { initProject } from '../../init.js'
import { reconcileRetiredAgentRoleResidue } from '../../agents/agent-role-config.js'
import { pruneStaleGeneratedFiles } from '../../init/skills.js'
import { repairCodexStartupConfig } from '../../doctor/codex-startup-config-repair.js'
import { repairAgentConfigFileReferences } from '../../codex/agent-config-file-repair.js'
import { PACKAGE_VERSION } from '../../fsx.js'
import {
  installOfficialSubagentAgentConfigs,
  mergeOfficialSubagentConfig,
  officialSubagentConfigOwnershipProof,
  readOfficialSubagentConfig
} from '../official-subagent-config.js'

test('fresh project config receives the official Codex subagent defaults', () => {
  const text = mergeOfficialSubagentConfig('')
  const parsed = parse(text) as Record<string, any>

  assert.equal(parsed.agents.max_threads, 12)
  assert.equal(parsed.agents.max_depth, 1)
  assert.equal(parsed.agents.job_max_runtime_seconds, 1200)
  assert.equal(parsed.agents.interrupt_message, true)
  assert.equal(Object.hasOwn(parsed.agents, 'warn_on_max_threads'), false)
})

test('project and inherited user max_threads values are preserved', () => {
  for (const value of [3, 20]) {
    const project = mergeOfficialSubagentConfig(`[agents]\nmax_threads = ${value}\n`)
    assert.equal((parse(project) as Record<string, any>).agents.max_threads, value)

    const inherited = mergeOfficialSubagentConfig('', {
      inheritedText: `[agents]\nmax_threads = ${value}\n`
    })
    assert.doesNotMatch(inherited, /^max_threads\s*=/m)
    assert.equal((parse(inherited) as Record<string, any>).agents.max_threads, undefined)
  }
})

test('legacy 4/5/historical 6 migrate only with proven SKS ownership', () => {
  for (const value of [4, 5, 6]) {
    const userOwned = mergeOfficialSubagentConfig(`[agents]\nmax_threads = ${value}\n`)
    assert.equal((parse(userOwned) as Record<string, any>).agents.max_threads, value)

    const sksOwned = mergeOfficialSubagentConfig(`[agents]\nmax_threads = ${value}\n`, { sksOwned: true })
    assert.equal((parse(sksOwned) as Record<string, any>).agents.max_threads, 12)
  }
})

test('owned config migration removes only exact legacy agent child tables', () => {
  const source = [
    '# SKS-MANAGED-CODEX-CONFIG',
    '[agents]',
    'max_threads = 4',
    '',
    '[agents.analysis_scout]',
    'description = "operator modified scout"',
    'config_file = "./agents/analysis-scout.toml"',
    'nickname_candidates = ["Scout", "Mapper"]',
    '',
    '[agents.native_agent]',
    'description = "SKS native agent with bounded write capability."',
    'config_file = "/tmp/project/.codex/agents/native-agent-intake.toml"',
    'nickname_candidates = ["Analysis", "Mapper"]',
    '',
    '[agents.team_consensus]',
    'description = "SKS planning/debate agent with bounded write capability."',
    'config_file = "./agents/team-consensus.toml"',
    'nickname_candidates = ["Consensus", "Atlas"]',
    '',
    '[agents.implementation_worker]',
    'description = "SKS bounded implementation worker."',
    'config_file = "./agents/implementation-worker.toml"',
    'nickname_candidates = ["Builder", "Mason"]',
    '',
    '[agents.db_safety_reviewer]',
    'description = "DB safety reviewer with bounded write capability."',
    'config_file = "./agents/db-safety-reviewer.toml"',
    'nickname_candidates = ["Sentinel", "Ledger"]',
    '',
    '[agents.qa_reviewer]',
    'description = "QA reviewer with bounded write capability."',
    'config_file = "./agents/qa-reviewer.toml"',
    'nickname_candidates = ["Verifier", "Reviewer"]',
    ''
  ].join('\n')

  const merged = mergeOfficialSubagentConfig(source, { sksOwned: true })
  const agents = (parse(merged) as Record<string, any>).agents
  assert.equal(agents.max_threads, 12)
  assert.equal(agents.analysis_scout.description, 'operator modified scout')
  for (const name of ['native_agent', 'team_consensus', 'implementation_worker', 'db_safety_reviewer', 'qa_reviewer']) {
    assert.equal(Object.hasOwn(agents, name), false, name)
  }
})

test('SKS config ownership accepts only explicit inventory marker receipt or exact legacy-block proof', () => {
  const inventory = officialSubagentConfigOwnershipProof({
    text: '[agents]\nmax_threads = 4\n',
    manifest: { generated_files: { files: ['.codex/config.toml'] } }
  })
  assert.equal(inventory.owned, true)
  assert.ok(inventory.reasons.includes('generated_file_inventory'))

  const marker = officialSubagentConfigOwnershipProof({
    text: '# SKS-MANAGED-CODEX-CONFIG\n[agents]\nmax_threads = 5\n'
  })
  assert.equal(marker.owned, true)
  assert.ok(marker.reasons.includes('managed_marker_or_hash'))

  const currentReceipt = {
    schema: 'sks.project-migration-receipt.v2',
    status: 'current',
    sks_version: PACKAGE_VERSION,
    installation_epoch_sha256: 'a'.repeat(64),
    blockers: [],
    required_blockers: [],
    update_stages: [{
      id: 'official-subagent-config',
      ok: true,
      status: 'completed',
      managed_keys: ['agents.max_threads']
    }]
  }
  const receipt = officialSubagentConfigOwnershipProof({
    text: '[agents]\nmax_threads = 6\n',
    migrationReceipt: currentReceipt
  })
  assert.equal(receipt.owned, true)
  assert.ok(receipt.reasons.includes('migration_receipt:agents.max_threads'))

  for (const migrationReceipt of [
    { ...currentReceipt, status: 'blocked', blockers: ['migration_failed'] },
    { ...currentReceipt, update_stages: [{ id: 'official-subagent-config', ok: false, status: 'failed', managed_keys: ['agents.max_threads'] }] },
    { ...currentReceipt, update_stages: [{ id: 'official-subagent-config', ok: true, status: 'skipped', managed_keys: ['agents.max_threads'] }] },
    { ...currentReceipt, update_stages: [{ id: 'official-subagent-config', ok: true, status: 'completed', detail: { ok: false, managed_keys: ['agents.max_threads'] } }] }
  ]) {
    const rejected = officialSubagentConfigOwnershipProof({
      text: '[agents]\nmax_threads = 6\n',
      migrationReceipt
    })
    assert.deepEqual(rejected, { owned: false, reasons: [] })
  }

  const exactLegacy = officialSubagentConfigOwnershipProof({
    text: [
      '[agents.native_agent]',
      'description = "SKS native agent with bounded write capability."',
      'config_file = "./agents/native-agent-intake.toml"',
      'nickname_candidates = ["Analysis", "Mapper"]',
      '',
      '[agents.team_consensus]',
      'description = "SKS planning/debate agent with bounded write capability."',
      'config_file = "./agents/team-consensus.toml"',
      'nickname_candidates = ["Consensus", "Atlas"]',
      '',
      '[agents.implementation_worker]',
      'description = "SKS bounded implementation worker."',
      'config_file = "./agents/implementation-worker.toml"',
      'nickname_candidates = ["Builder", "Mason"]',
      ''
    ].join('\n')
  })
  assert.equal(exactLegacy.owned, true)
  assert.ok(exactLegacy.reasons.includes('exact_legacy_managed_blocks:3'))

  const userOwned = officialSubagentConfigOwnershipProof({
    text: '[agents]\nmax_threads = 5\n'
  })
  assert.deepEqual(userOwned, { owned: false, reasons: [] })
})

test('agents parent table is inserted safely before an existing custom child table', () => {
  const merged = mergeOfficialSubagentConfig('[agents.custom]\ndescription = "user role"\n')
  const parsed = parse(merged) as Record<string, any>

  assert.equal(parsed.agents.max_threads, 12)
  assert.equal(parsed.agents.custom.description, 'user role')
  assert.ok(merged.indexOf('[agents]') < merged.indexOf('[agents.custom]'))
})

test('official config merge supports an agents header with an inline comment', () => {
  const source = '# SKS-MANAGED-CODEX-CONFIG\n[agents] # operator note\nmax_threads = 4\n'
  const merged = mergeOfficialSubagentConfig(source, { sksOwned: true })
  const parsed = parse(merged) as Record<string, any>

  assert.equal(parsed.agents.max_threads, 12)
  assert.equal(parsed.agents.max_depth, 1)
  assert.equal(parsed.agents.job_max_runtime_seconds, 1200)
  assert.equal(parsed.agents.interrupt_message, true)
  assert.match(merged, /\[agents\] # operator note/)
})

test('official doctor repair does not treat generic multi_agent config as SKS ownership', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-near-miss-'))
  const configPath = path.join(root, '.codex', 'config.toml')
  const original = '[features]\nmulti_agent = true\n\n[agents]\nmax_threads = 4\n'
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, original)

  const result = await repairAgentConfigFileReferences({ root, apply: true, reportPath: null })
  assert.equal(result.ok, false)
  assert.equal(result.manual_required, true)
  assert.deepEqual(result.ownership_proof, { owned: false, reasons: [] })
  assert.ok(result.blockers.includes('user_owned_file_without_sks_marker'))
  assert.equal(await fs.readFile(configPath, 'utf8'), original)
})

test('official doctor repair backs up invalid project TOML before unmanaged rejection', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-invalid-doctor-'))
  const configPath = path.join(root, '.codex', 'config.toml')
  const invalid = '[agents\nmax_threads = 4\n'
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, invalid)

  const result = await repairAgentConfigFileReferences({ root, apply: true, reportPath: null })
  assert.equal(result.ok, false)
  assert.equal(result.manual_required, true)
  assert.ok(result.blockers.includes('project_official_subagent_config_toml_parse_failed'))
  assert.ok(result.blockers.includes('user_owned_file_without_sks_marker'))
  assert.ok(result.backup_path)
  assert.equal(await fs.readFile(configPath, 'utf8'), invalid)
  assert.equal(await fs.readFile(String(result.backup_path), 'utf8'), invalid)
})

test('fresh agent install materializes the complete project-scoped custom agent catalog', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-agents-'))
  const legacy = path.join(root, '.codex', 'agents', 'analysis-scout.toml')
  await fs.mkdir(path.dirname(legacy), { recursive: true })
  await fs.writeFile(legacy, 'name = "user_legacy_role"\n')

  const first = await installOfficialSubagentAgentConfigs(root)
  const files = (await fs.readdir(path.dirname(legacy))).sort()
  const expectedRoleFiles = MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename).sort()
  assert.deepEqual(files, ['analysis-scout.toml', ...expectedRoleFiles].sort())
  assert.deepEqual(first.created.sort(), expectedRoleFiles.map((filename) => `.codex/agents/${filename}`).sort())
  assert.deepEqual(first.generated_files.sort(), expectedRoleFiles.map((filename) => `.codex/agents/${filename}`).sort())
  assert.equal(await fs.readFile(legacy, 'utf8'), 'name = "user_legacy_role"\n')

  for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
    const text = await fs.readFile(path.join(root, '.codex', 'agents', role.filename), 'utf8')
    const parsed = parse(text) as Record<string, any>
    assert.equal(parsed.name, role.codex_name)
    assert.equal(parsed.model, role.model)
    assert.equal(parsed.model_reasoning_effort, role.model_reasoning_effort)
    assert.equal(Object.hasOwn(parsed, 'sandbox_mode'), role.sandbox === 'read-only')
    assert.equal(parsed.sandbox_mode, role.sandbox)
  }

  const second = await installOfficialSubagentAgentConfigs(root)
  assert.deepEqual(second.created, [])
  assert.deepEqual(second.updated, [])
  assert.deepEqual(second.existing.sort(), expectedRoleFiles.map((filename) => `.codex/agents/${filename}`).sort())
})

test('retired SKS-owned role sets are removed and modified collisions are quarantined', async () => {
  for (const legacyCount of [4, 5, 6]) {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), `sks-official-agent-legacy-${legacyCount}-`))
    const agentsDir = path.join(root, '.codex', 'agents')
    await fs.mkdir(agentsDir, { recursive: true })
    for (const role of RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES.slice(0, legacyCount)) {
      await fs.writeFile(path.join(agentsDir, role.filename), managedAgentRoleContent(role))
    }
    const modifiedRole = RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[legacyCount]
    assert.ok(modifiedRole)
    const modifiedPath = path.join(agentsDir, modifiedRole.filename)
    await fs.writeFile(modifiedPath, managedAgentRoleContent(modifiedRole).replace(modifiedRole.description, 'operator modified role'))

    const result = await reconcileRetiredAgentRoleResidue({ root, home: path.join(root, 'home'), fix: true })
    assert.equal(result.ok, true)
    assert.equal(result.removed_count, legacyCount)
    assert.equal(result.quarantined_user_collision_count, 1)
    assert.equal(result.remaining_count, 0)
    for (const role of RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES.slice(0, legacyCount)) {
      await assert.rejects(fs.access(path.join(agentsDir, role.filename)))
    }
    await assert.rejects(fs.access(modifiedPath))
    const quarantined = await findFile(path.join(root, '.sneakoscope', 'quarantine'), modifiedRole.filename)
    assert.ok(quarantined)
    assert.equal(await fs.readFile(quarantined!, 'utf8'), managedAgentRoleContent(modifiedRole).replace(modifiedRole.description, 'operator modified role'))
  }
})

test('retired agent cleanup never follows role roots or role-file symlinks outside their owner root', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retired-agent-symlink-root-'))
  const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retired-agent-symlink-outside-'))
  try {
    const home = path.join(root, 'home')
    const globalAgentsDir = path.join(home, '.codex', 'agents')
    const projectAgentsDir = path.join(root, '.codex', 'agents')
    const role = RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[0]
    assert.ok(role)
    const outsideRootFile = path.join(outside, 'root-role.toml')
    const outsideLeafFile = path.join(outside, 'leaf-role.toml')
    const rootBytes = Buffer.from(managedAgentRoleContent(role))
    const leafBytes = Buffer.from('name = "customer-external-role"\n')
    await fs.mkdir(path.dirname(globalAgentsDir), { recursive: true })
    await fs.mkdir(projectAgentsDir, { recursive: true })
    await fs.writeFile(outsideRootFile, rootBytes)
    await fs.writeFile(outsideLeafFile, leafBytes)
    await fs.symlink(outside, globalAgentsDir)
    await fs.symlink(outsideLeafFile, path.join(projectAgentsDir, role.filename))

    const result = await reconcileRetiredAgentRoleResidue({ root, home, codexHome: path.join(home, '.codex'), fix: true })
    assert.equal(result.ok, true)
    assert.equal(result.quarantined_user_collision_count, 2)
    assert.deepEqual(await fs.readFile(outsideRootFile), rootBytes)
    assert.deepEqual(await fs.readFile(outsideLeafFile), leafBytes)
    await assert.rejects(fs.lstat(globalAgentsDir))
    await assert.rejects(fs.lstat(path.join(projectAgentsDir, role.filename)))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
    await fs.rm(outside, { recursive: true, force: true })
  }
})

test('retired agent cleanup covers HOME and global-runtime disabled backups with marker proof', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retired-agent-global-roots-'))
  try {
    const home = path.join(root, 'home')
    const globalRuntimeRoot = path.join(root, 'global-runtime')
    const role = RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[0]
    assert.ok(role)
    const homeBackupDir = path.join(home, '.codex', 'agents-disabled', 'sks')
    const runtimeBackupDir = path.join(globalRuntimeRoot, '.codex', 'agents-disabled', 'sks')
    const runtimeActiveDir = path.join(globalRuntimeRoot, '.codex', 'agents')
    const managedHomeBackup = path.join(homeBackupDir, `${role.filename}.bak`)
    const managedRuntimeBackup = path.join(runtimeBackupDir, `${role.filename}.legacy.bak`)
    const managedRuntimeActiveBackup = path.join(runtimeActiveDir, `${role.filename}.legacy.bak`)
    const customerBackup = path.join(runtimeBackupDir, `${role.filename.replace(/\.toml$/i, '')}-customer.bak`)
    const customerBytes = Buffer.from('name = "customer-backup"\n')
    await fs.mkdir(homeBackupDir, { recursive: true })
    await fs.mkdir(runtimeBackupDir, { recursive: true })
    await fs.mkdir(runtimeActiveDir, { recursive: true })
    await fs.writeFile(managedHomeBackup, managedAgentRoleContent(role))
    await fs.writeFile(managedRuntimeBackup, managedAgentRoleContent(role))
    await fs.writeFile(managedRuntimeActiveBackup, managedAgentRoleContent(role))
    await fs.writeFile(customerBackup, customerBytes)

    const result = await reconcileRetiredAgentRoleResidue({
      root,
      home,
      codexHome: path.join(home, '.codex'),
      globalRuntimeRoot,
      fix: true
    })
    assert.equal(result.ok, true)
    assert.equal(result.removed_count, 3)
    assert.equal(result.quarantined_user_collision_count, 1)
    await assert.rejects(fs.access(managedHomeBackup))
    await assert.rejects(fs.access(managedRuntimeBackup))
    await assert.rejects(fs.access(managedRuntimeActiveBackup))
    await assert.rejects(fs.access(customerBackup))
    const quarantined = await findFile(path.join(globalRuntimeRoot, '.sneakoscope', 'quarantine'), path.basename(customerBackup))
    assert.ok(quarantined)
    assert.deepEqual(await fs.readFile(quarantined!), customerBytes)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('retired agent cleanup accepts an external CODEX_HOME as its own managed boundary', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-retired-agent-external-codex-home-'))
  try {
    const project = path.join(root, 'project')
    const home = path.join(root, 'home')
    const codexHome = path.join(root, 'codex-home')
    const role = RETIRED_MANAGED_AGENT_ROLE_TOMBSTONES[0]
    assert.ok(role)
    const activeRole = path.join(codexHome, 'agents', role.filename)
    const disabledRole = path.join(codexHome, 'agents-disabled', 'sks', `${role.filename}.legacy.bak`)
    await fs.mkdir(project, { recursive: true })
    await fs.mkdir(path.dirname(activeRole), { recursive: true })
    await fs.mkdir(path.dirname(disabledRole), { recursive: true })
    await fs.writeFile(activeRole, managedAgentRoleContent(role))
    await fs.writeFile(disabledRole, managedAgentRoleContent(role))

    const result = await reconcileRetiredAgentRoleResidue({ root: project, home, codexHome, fix: true })
    assert.equal(result.ok, true)
    assert.equal(result.removed_count, 2)
    assert.equal(result.remaining_count, 0)
    assert.equal(result.error_count, 0)
    await assert.rejects(fs.access(activeRole))
    await assert.rejects(fs.access(disabledRole))
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test('marker plus body hash owns generated files and detects user modification', () => {
  for (const role of MANAGED_OFFICIAL_SUBAGENT_ROLES) {
    const managed = managedOfficialSubagentRoleContent(role)
    assert.equal(managedOfficialSubagentRoleOwnsText(managed, role), true)
    assert.equal(managedOfficialSubagentRoleOwnsText(managed.replace(role.model, `${role.model}-changed`), role), false)
  }
})

test('user collisions and invalid TOML are preserved with manual blockers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-agent-collision-'))
  const agentsDir = path.join(root, '.codex', 'agents')
  await fs.mkdir(agentsDir, { recursive: true })
  const workerPath = path.join(agentsDir, 'worker.toml')
  const expertPath = path.join(agentsDir, 'expert.toml')
  const customWorker = 'name = "worker"\ndescription = "my custom worker"\n'
  const invalidExpert = 'name = "expert"\ndeveloper_instructions = """\nunterminated\n'
  await fs.writeFile(workerPath, customWorker)
  await fs.writeFile(expertPath, invalidExpert)

  const result = await installOfficialSubagentAgentConfigs(root)
  assert.equal(result.ok, false)
  assert.equal(await fs.readFile(workerPath, 'utf8'), customWorker)
  assert.equal(await fs.readFile(expertPath, 'utf8'), invalidExpert)
  assert.ok(result.manual_blockers.includes('manual_user_owned_official_subagent_collision:.codex/agents/worker.toml'))
  assert.ok(result.manual_blockers.includes('manual_invalid_official_subagent_toml:.codex/agents/expert.toml'))
  assert.equal(result.backups.length, 1)
  assert.equal(await fs.readFile(path.join(root, result.backups[0] || ''), 'utf8'), invalidExpert)
})

test('official config reader resolves project over global and preserves inherited values', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-read-'))
  const codexHome = path.join(root, 'home', '.codex')
  await fs.mkdir(path.join(root, '.codex'), { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), '[agents]\nmax_depth = 1\n')
  await fs.writeFile(path.join(codexHome, 'config.toml'), '[agents]\nmax_threads = 20\nmax_depth = 3\ninterrupt_message = false\n')

  const config = await readOfficialSubagentConfig(root, { codexHome })
  assert.equal(config.maxThreads, 20)
  assert.equal(config.sources.maxThreads, 'global')
  assert.equal(config.maxDepth, 1)
  assert.equal(config.sources.maxDepth, 'project')
  assert.equal(config.interruptMessage, false)
  assert.equal(config.sources.interruptMessage, 'global')
  assert.deepEqual(config.warnings, [])
})

test('max_depth above one is preserved and reported as a warning', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-depth-warning-'))
  const codexHome = path.join(root, 'home', '.codex')
  await fs.mkdir(path.join(root, '.codex'), { recursive: true })
  await fs.mkdir(codexHome, { recursive: true })
  const original = '[agents]\nmax_threads = 3\nmax_depth = 4\n'
  await fs.writeFile(path.join(root, '.codex', 'config.toml'), original)

  const merged = mergeOfficialSubagentConfig(original)
  assert.equal((parse(merged) as Record<string, any>).agents.max_depth, 4)
  const config = await readOfficialSubagentConfig(root, { codexHome })
  assert.equal(config.maxDepth, 4)
  assert.deepEqual(config.warnings, ['official_subagent_max_depth_above_one_preserved:4:project'])
})

test('project setup migrates marker-proven legacy max_threads without requiring a current manifest', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-marker-migration-'))
  const home = path.join(root, 'home')
  const configPath = path.join(root, '.codex', 'config.toml')
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, '# SKS-MANAGED-CODEX-CONFIG\n[agents]\nmax_threads = 4\n')

  const result = await initProject(root, {
    installScope: 'project',
    localOnly: true,
    home,
    codexHome: path.join(home, '.codex')
  })
  const parsed = parse(await fs.readFile(configPath, 'utf8')) as Record<string, any>
  assert.equal(parsed.agents.max_threads, 12)
  assert.equal(result.codex_config_install.ownership_proof.owned, true)
  assert.ok(result.codex_config_install.ownership_proof.reasons.includes('managed_marker_or_hash'))
})

test('doctor repair migrates an SKS-owned legacy thread value and preserves max_depth above one with a warning', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-doctor-migration-'))
  const home = path.join(root, 'home')
  const codexHome = path.join(home, '.codex')
  const configPath = path.join(root, '.codex', 'config.toml')
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, '# SKS-MANAGED-CODEX-CONFIG\n[agents]\nmax_threads = 6\nmax_depth = 4\n')

  const result = await repairCodexStartupConfig({ root, apply: true, home, codexHome })
  const parsed = parse(await fs.readFile(configPath, 'utf8')) as Record<string, any>
  assert.equal(result.ok, true)
  assert.equal(parsed.agents.max_threads, 12)
  assert.equal(parsed.agents.max_depth, 4)
  assert.equal(parsed.agents.job_max_runtime_seconds, 1200)
  assert.equal(parsed.agents.interrupt_message, true)
  assert.ok(result.config_file_repair.warnings.includes('official_subagent_max_depth_above_one_preserved:4:project'))
  assert.deepEqual(
    (await fs.readdir(path.join(root, '.codex', 'agents'))).sort(),
    MANAGED_OFFICIAL_SUBAGENT_ROLES.map((role) => role.filename).sort()
  )
})

test('project setup backs up and preserves invalid config TOML without overwriting it', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-config-invalid-'))
  const home = path.join(root, 'home')
  const configPath = path.join(root, '.codex', 'config.toml')
  const invalid = '[agents\nmax_threads = 5\n'
  await fs.mkdir(path.dirname(configPath), { recursive: true })
  await fs.writeFile(configPath, invalid)

  const result = await initProject(root, {
    installScope: 'project',
    localOnly: true,
    home,
    codexHome: path.join(home, '.codex')
  })
  assert.equal(result.codex_config_install.status, 'unparseable_config_preserved')
  assert.equal(await fs.readFile(configPath, 'utf8'), invalid)
  assert.equal(await fs.readFile(result.codex_config_install.backup_path, 'utf8'), invalid)
})

test('setup repair preserves current-role collisions and quarantines retired-role collisions', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-agent-repair-preserve-'))
  const home = path.join(root, 'home')
  const agentsDir = path.join(root, '.codex', 'agents')
  const workerPath = path.join(agentsDir, 'worker.toml')
  const expertPath = path.join(agentsDir, 'expert.toml')
  const legacyPath = path.join(agentsDir, 'analysis-scout.toml')
  const customWorker = 'name = "worker"\ndescription = "custom user worker"\n'
  const invalidExpert = 'name = "expert"\ndeveloper_instructions = """\ninvalid\n'
  const legacy = 'name = "legacy_user_role"\n'
  await fs.mkdir(agentsDir, { recursive: true })
  await fs.writeFile(workerPath, customWorker)
  await fs.writeFile(expertPath, invalidExpert)
  await fs.writeFile(legacyPath, legacy)

  const result = await initProject(root, {
    installScope: 'project',
    localOnly: true,
    repair: true,
    home,
    codexHome: path.join(home, '.codex')
  })
  assert.equal(await fs.readFile(workerPath, 'utf8'), customWorker)
  assert.equal(await fs.readFile(expertPath, 'utf8'), invalidExpert)
  await assert.rejects(fs.access(legacyPath))
  const quarantinedLegacy = await findFile(path.join(root, '.sneakoscope', 'quarantine'), 'analysis-scout.toml')
  assert.ok(quarantinedLegacy)
  assert.equal(await fs.readFile(quarantinedLegacy!, 'utf8'), legacy)
  assert.ok(result.agent_install.manual_blockers.includes('manual_user_owned_official_subagent_collision:.codex/agents/worker.toml'))
  assert.ok(result.agent_install.manual_blockers.includes('manual_invalid_official_subagent_toml:.codex/agents/expert.toml'))
  assert.equal(result.agent_install.backups.length, 1)
})

test('generated Naruto skill describes the official workflow and retired aliases stay absent', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-skill-copy-'))
  const home = path.join(root, 'home')
  await initProject(root, {
    installScope: 'global',
    localOnly: true,
    home,
    codexHome: path.join(home, '.codex')
  })

  const agentsRules = await fs.readFile(path.join(root, 'AGENTS.md'), 'utf8')
  const naruto = await fs.readFile(path.join(root, '.agents', 'skills', 'sks-naruto', 'SKILL.md'), 'utf8')
  assert.match(naruto, /Codex official subagent workflow/)
  assert.match(naruto, /--agents N/)
  assert.match(naruto, /GPT-5\.6 Sol Max/)
  assert.match(naruto, /Luna Max/)
  assert.match(naruto, /Sol High/)
  assert.match(naruto, /Terra Medium/)
  assert.match(naruto, /Browser\/Chrome/)
  assert.match(naruto, /subagent-plan\.json/)
  assert.match(naruto, /subagent-parent-summary\.json/)
  assert.match(naruto, /lifecycle[- ]only/)
  assert.doesNotMatch(naruto, /verification-summary\.json|five-artifact/)
  assert.doesNotMatch(naruto, /native shadow-clone|up to 100|--backend codex-exec|--clones N/)
  assert.match(agentsRules, /default to the `\$sks-naruto` Codex official subagent workflow/)
  assert.match(agentsRules, /subagent-parent-summary\.json/)
  assert.match(agentsRules, /Luna Max only for tiny short-context mechanical work/)
  assert.match(agentsRules, /Terra Medium for long-context analysis/)
  assert.doesNotMatch(agentsRules, /native agent intake agents|fresh executor team/)
  assert.doesNotMatch(agentsRules, /\$Team|sks team|\$MAD-DB|sks mad-db/)
  for (const name of ['team', 'mad-db', 'swarm', 'shadow-clone', 'kage-bunshin']) {
    await assert.rejects(fs.access(path.join(root, '.agents', 'skills', name, 'SKILL.md')))
  }
})

test('stale generated prune never deletes legacy or user Codex agent files', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-official-agent-prune-'))
  const legacy = path.join(root, '.codex', 'agents', 'analysis-scout.toml')
  await fs.mkdir(path.dirname(legacy), { recursive: true })
  await fs.writeFile(legacy, 'name = "legacy"\n')

  const result = await pruneStaleGeneratedFiles(root, {
    generated_files: { files: ['.codex/agents/analysis-scout.toml'] }
  }, [])
  assert.deepEqual(result.pruned, [])
  assert.equal(await fs.readFile(legacy, 'utf8'), 'name = "legacy"\n')
})

async function findFile(root: string, name: string): Promise<string | null> {
  const rows = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const row of rows) {
    const file = path.join(root, row.name)
    if (row.isDirectory()) {
      const nested = await findFile(file, name)
      if (nested) return nested
    } else if (row.name === name) return file
  }
  return null
}

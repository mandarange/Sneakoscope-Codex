#!/usr/bin/env node
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export async function runCodexNativeGate(id: string): Promise<void> {
  if (id === 'brand-neutrality:zero-leakage') return brandZeroLeakage(id)
  if (id === 'brand-neutrality:zero-leakage-blackbox') return brandZeroLeakageBlackbox(id)
  if (id === 'docs:brand-neutrality') return docsBrandNeutrality(id)
  if (id === 'codex-native:feature-broker') return featureBroker(id)
  if (id === 'codex-native:harness-compat') return harnessCompat(id)
  if (id === 'codex-native:invocation-defaults') return invocationDefaults(id)
  if (id === 'codex-native:invocation-router') return invocationRouter(id)
  if (id === 'codex-native:route-map') return routeMap(id)
  if (id.startsWith('pipeline:codex-native-')) return pipelineGate(id)
  if (id === 'codex-native:interop-policy') return interopPolicy(id)
  if (id === 'codex-native:skill-content') return skillContent(id)
  if (id === 'codex-native:agent-role-content') return agentRoleContent(id)
  if (id === 'codex-native:hook-lifecycle-proof') return hookLifecycleProof(id)
  if (id === 'init-deep:backup-retention') return initDeepBackupRetention(id)
  if (id === 'release-scripts:type-safe') return releaseScriptsTypeSafe(id)
  if (id === 'lint:no-ts-nocheck-release-scripts') return noTsNoCheckReleaseScripts(id)
  if (id === 'doctor:codex-native-readiness-ux') return doctorReadinessUx(id)
  if (id === 'doctor:codex-native-repair-actions') return doctorRepairActions(id)
  if (id === 'codex-native:feature-broker-blackbox') return featureBrokerBlackbox(id)
  throw new Error(`unknown_gate:${id}`)
}

async function brandZeroLeakage(id: string): Promise<void> {
  const report = await scanBrandLeakage(root)
  const out = path.join(root, '.sneakoscope', 'reports', 'brand-neutrality-zero-leakage.json')
  await fsp.mkdir(path.dirname(out), { recursive: true })
  await fsp.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  assertGate(report.ok, 'brand neutrality leakage detected', report)
  emitGate(id, { scanned_files: report.scanned_files, forbidden_term_hashes: report.forbidden_term_hashes })
}

async function brandZeroLeakageBlackbox(id: string): Promise<void> {
  const tmp = await tempRoot(id)
  await fsp.mkdir(path.join(tmp, 'docs'), { recursive: true })
  await fsp.writeFile(path.join(tmp, 'docs', 'fixture.md'), 'secret-reference-token appears here\n', 'utf8')
  const previous = process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS
  process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS = 'secret-reference-token'
  try {
    const report = await scanBrandLeakage(tmp)
    assertGate(report.ok === false && report.redacted_offenders.length === 1, 'blackbox must detect forbidden token without printing it', report)
    assertGate(!JSON.stringify(report).includes('secret-reference-token'), 'blackbox output leaked forbidden token', report)
  } finally {
    if (previous === undefined) delete process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS
    else process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS = previous
  }
  emitGate(id)
}

async function docsBrandNeutrality(id: string): Promise<void> {
  const report = await scanBrandLeakage(root, ['README.md', 'CHANGELOG.md', 'docs'])
  assertGate(report.ok, 'docs contain forbidden external reference terms', report)
  emitGate(id, { scanned_files: report.scanned_files })
}

async function featureBroker(id: string): Promise<void> {
  const matrix = await buildFixtureMatrix(id, { hook: 'approved' })
  assertGate(matrix.schema === 'sks.codex-native-feature-matrix.v1', 'matrix schema mismatch', matrix)
  emitGate(id, { hook_evidence_policy: matrix.invocation_defaults.hook_evidence_policy })
}

async function harnessCompat(id: string): Promise<void> {
  const previous = fakeEnv({ hook: 'approved' })
  try {
    const tmp = await tempRoot(id)
    const mod = await importDist('core/codex-app/codex-app-harness-matrix.js')
    const matrix = await mod.buildCodexAppHarnessMatrix({ root: tmp })
    assertGate(matrix.schema === 'sks.codex-app-harness-matrix.v1', 'compat schema mismatch', matrix)
  } finally {
    restoreEnv(previous)
  }
  emitGate(id)
}

async function invocationDefaults(id: string): Promise<void> {
  const approved = await buildFixtureMatrix(id, { hook: 'approved' })
  assertGate(approved.invocation_defaults.hook_evidence_policy === 'approved-only', 'approved hook must count', approved.invocation_defaults)
  const unknown = await buildFixtureMatrix(`${id}-unknown`, { hook: 'unknown' })
  assertGate(unknown.invocation_defaults.hook_evidence_policy === 'unknown-do-not-count', 'unknown hook must not count', unknown.invocation_defaults)
  emitGate(id)
}

async function invocationRouter(id: string): Promise<void> {
  const previous = fakeEnv({ hook: 'unknown' })
  try {
    const tmp = await tempRoot(id)
    const mod = await importDist('core/codex-native/codex-native-invocation-router.js')
    const agent = await mod.resolveCodexNativeInvocationPlan({ root: tmp, missionId: 'M-router', route: '$Loop', desiredCapability: 'agent-role' })
    const hook = await mod.resolveCodexNativeInvocationPlan({ root: tmp, missionId: 'M-router', route: '$MAD', desiredCapability: 'hook-evidence' })
    assertGate(agent.selected_strategy === 'codex-sdk', 'agent-role plan should record the native codex-sdk strategy', agent)
    assertGate(hook.selected_strategy === 'blocked' && hook.blockers.includes('hook_approval_not_approved'), 'hook evidence must block when approval unknown', hook)
    assertGate(fs.existsSync(path.join(tmp, '.sneakoscope', 'missions', 'M-router', 'codex-native-invocation-plan.loop.agent-role.json')), 'mission invocation artifact missing')
  } finally {
    restoreEnv(previous)
  }
  emitGate(id)
}

async function routeMap(id: string): Promise<void> {
  const source = readText('src/core/codex-native/codex-native-invocation-router.ts')
  for (const token of ['$Loop', '$QA-LOOP', '$Research', '$Image', '$MAD', '$Doctor', 'hook_approval_not_approved']) {
    assertGate(source.includes(token), `route map token missing:${token}`)
  }
  emitGate(id)
}

async function pipelineGate(id: string): Promise<void> {
  if (id === 'pipeline:codex-native-qa-routing') {
    const source = readText('src/core/qa-loop.ts')
    assertGate(source.includes('resolveQaCodexNativeInvocation') && source.includes('hook_evidence_policy') && source.includes('image_path_strategy'), 'QA routing not wired')
  } else if (id === 'pipeline:codex-native-research-routing') {
    const source = readText('src/core/research.ts')
    assertGate(source.includes('resolveResearchCodexNativeInvocation') && source.includes('selected_source_strategy'), 'Research routing not wired')
  } else if (id === 'pipeline:codex-native-image-routing') {
    const source = readText('src/core/image/image-artifact-path-contract.ts')
    assertGate(source.includes('codex_native_followup_strategy') && source.includes('resolveCodexNativeInvocationPlan'), 'Image routing not wired')
  } else if (id === 'pipeline:codex-native-doctor-mad-routing') {
    const doctor = readText('src/commands/doctor.ts')
    const mad = readText('src/core/commands/mad-sks-command.ts')
    assertGate(doctor.includes('SKS Runtime Readiness') && doctor.includes('buildCodexNativeFeatureMatrix'), 'Doctor readiness not wired')
    assertGate(mad.includes('codex-native') || doctor.includes('hook-derived evidence will not count'), 'MAD/Doctor hook evidence policy not visible')
  } else if (id === 'pipeline:codex-native-e2e-blackbox') {
    await invocationRouter('pipeline:codex-native-e2e-blackbox/router')
    await pipelineGate('pipeline:codex-native-qa-routing')
    await pipelineGate('pipeline:codex-native-research-routing')
    await pipelineGate('pipeline:codex-native-image-routing')
  }
  emitGate(id)
}

async function interopPolicy(id: string): Promise<void> {
  assertGate(readText('src/core/codex-native/codex-native-feature-broker.ts').includes('external route assets') === false, 'broker should not expose interop branding text')
  emitGate(id)
}

async function skillContent(id: string): Promise<void> {
  const tmp = await tempRoot(id)
  const mod = await importDist('core/codex-app/codex-skill-sync.js')
  const skillsRoot = path.join(tmp, 'skills')
  const report = await mod.syncCodexSksSkills({ root: tmp, skillsRoot, apply: true })
  const skill = fs.readFileSync(path.join(skillsRoot, 'sks-align', 'SKILL.md'), 'utf8')
  assertGate(skill.includes('Purpose:') && skill.includes('Route:') && skill.includes('Proof paths:') && skill.includes('Failure recovery:'), 'managed skill content incomplete', { skill, report })
  assertGate(report.interop.clobbered_user_skills === false, 'skill sync clobbered user skills', report)
  emitGate(id)
}

async function agentRoleContent(id: string): Promise<void> {
  const previous = fakeEnv({ hook: 'approved' })
  try {
    const tmp = await tempRoot(id)
    const mod = await importDist('core/codex-app/codex-agent-role-sync.js')
    const codexHome = path.join(tmp, 'codex-home')
    const report = await mod.syncCodexAgentRoles({ root: tmp, codexHome, apply: true })
    const role = fs.readFileSync(path.join(tmp, '.codex', 'agents', 'worker.toml'), 'utf8')
    // The worker role carries the newest fast-tier model, never a pinned id.
    const tiers = await importDist('core/subagents/model-tiers.js')
    const fastModel = String(tiers.latestModelForTier('fast'))
    assertGate(role.includes(`model = "${fastModel}"`) && role.includes('Work only on the exact slice assigned by the parent agent.'), 'official worker role content incomplete', { role, report, fastModel })
    assertGate(!fs.existsSync(path.join(codexHome, 'agents')), 'agent role content gate must not create global directive roles', report)
  } finally {
    restoreEnv(previous)
  }
  emitGate(id)
}

async function hookLifecycleProof(id: string): Promise<void> {
  const previous = fakeEnv({ hook: 'unknown' })
  try {
    const tmp = await tempRoot(id)
    const mod = await importDist('core/codex-app/codex-hook-lifecycle.js')
    const report = await mod.buildCodexHookLifecycle({ root: tmp })
    const events = Object.values(report.lifecycle || {}) as Array<{ counted_as_evidence?: boolean }>
    assertGate(events.every((event) => event.counted_as_evidence === false), 'unknown hooks must not count as evidence', report)
  } finally {
    restoreEnv(previous)
  }
  emitGate(id)
}

async function initDeepBackupRetention(id: string): Promise<void> {
  const tmp = await tempRoot(id)
  await fsp.mkdir(path.join(tmp, 'src/core/runtime'), { recursive: true })
  await fsp.writeFile(path.join(tmp, 'src/core/runtime', 'AGENTS.md'), '# User local guidance\nKeep me.\n', 'utf8')
  for (let index = 0; index < 18; index += 1) await fsp.writeFile(path.join(tmp, 'src/core/runtime', `f${index}.ts`), 'export {}\n', 'utf8')
  const previous = process.env.SKS_INIT_DEEP_BACKUP_RETENTION
  process.env.SKS_INIT_DEEP_BACKUP_RETENTION = '1'
  try {
    const mod = await importDist('core/codex-app/codex-init-deep.js')
    const first = await mod.runCodexInitDeep({ root: tmp, apply: true, directoryLocal: true })
    const second = await mod.runCodexInitDeep({ root: tmp, apply: true, directoryLocal: true })
    assertGate(first.directory_local_agents.changed_only_backup === true, 'changed-only backup flag missing', first)
    assertGate(second.directory_local_agents.unchanged_files.length >= 1, 'unchanged second run should not create backup', second)
  } finally {
    if (previous === undefined) delete process.env.SKS_INIT_DEEP_BACKUP_RETENTION
    else process.env.SKS_INIT_DEEP_BACKUP_RETENTION = previous
  }
  emitGate(id)
}

async function releaseScriptsTypeSafe(id: string): Promise<void> {
  for (const rel of ['src/scripts/release-dag-full-coverage-check.ts', 'src/scripts/typed-routing-gate-lib.ts', 'src/scripts/codex-native-gate-lib.ts', 'src/scripts/release-script-lint-gate-lib.ts']) {
    const text = readText(rel)
    assertGate(!/^\s*\/\/\s*@ts-nocheck\b/m.test(text), `release helper still has ts-nocheck:${rel}`)
  }
  assertGate(readText('src/scripts/release-dag-full-coverage-check.ts').includes('interface ReleaseGate'), 'release DAG helper missing typed interfaces')
  assertGate(readText('src/scripts/codex-native-gate-lib.ts').includes('interface PackageJsonShape'), '3.1.6 helper missing typed package shape')
  emitGate(id)
}

async function noTsNoCheckReleaseScripts(id: string): Promise<void> {
  const offenders: string[] = []
  const checked = listFiles(path.join(root, 'src/scripts')).filter((file) => {
    const rel = path.relative(root, file).split(path.sep).join('/')
    return /^src\/scripts\/release-dag-full-coverage-check\.ts$/.test(rel)
      || /^src\/scripts\/(?:typed-routing|codex-native|release-script-lint)-gate-lib\.ts$/.test(rel)
      || /^src\/scripts\/no-ts-nocheck-release-scripts-check\.ts$/.test(rel)
      || /^src\/scripts\/release-script-type-safety-check\.ts$/.test(rel)
  })
  for (const file of checked) {
    if (/^\s*\/\/\s*@ts-nocheck\b/m.test(fs.readFileSync(file, 'utf8'))) offenders.push(path.relative(root, file))
  }
  assertGate(offenders.length === 0, 'release script ts-nocheck offenders found', { offenders, checked: checked.length })
  emitGate(id, { checked: checked.length })
}

async function doctorReadinessUx(id: string): Promise<void> {
  const source = readText('src/commands/doctor.ts')
  for (const token of ['SKS Runtime Readiness', 'Codex Native:', 'QA Visual:', 'Research Sources:', 'hook-derived evidence will not count']) {
    assertGate(source.includes(token), `doctor readiness token missing:${token}`)
  }
  emitGate(id)
}

async function doctorRepairActions(id: string): Promise<void> {
  const doctor = await importDist('commands/doctor.js')
  const readiness = doctor.buildRuntimeReadiness({
    ok: false,
    codex_cli: { available: true },
    features: { project_memory: { ok: false } }
  })
  const expected = [
    ['Codex Native managed assets: sks doctor', '--fix', '--repair-codex-native', '--yes'].join(' '),
    'Project memory: sks codex-native init-deep --apply --directory-local'
  ]
  assertGate(
    expected.every((action) => readiness.repair_actions.includes(action)),
    'doctor repair actions must expose executable base Codex recovery commands',
    { repair_actions: readiness.repair_actions, expected }
  )
  emitGate(id)
}

async function featureBrokerBlackbox(id: string): Promise<void> {
  const all = await buildFixtureMatrix(`${id}-all`, { hook: 'approved' })
  assertGate(all.invocation_defaults.hook_evidence_policy === 'approved-only', 'all-ready scenario should count approved hooks', all.invocation_defaults)
  const unknownHook = await buildFixtureMatrix(`${id}-hook`, { hook: 'unknown' })
  assertGate(unknownHook.invocation_defaults.hook_evidence_policy === 'unknown-do-not-count', 'unknown hook scenario should not count', unknownHook)
  emitGate(id)
}

async function buildFixtureMatrix(id: string, opts: { hook: 'approved' | 'unknown' }): Promise<Record<string, any>> {
  const previous = fakeEnv({ hook: opts.hook })
  try {
    const tmp = await tempRoot(id)
    const mod = await importDist('core/codex-native/codex-native-feature-broker.js')
    return await mod.buildCodexNativeFeatureMatrix({ root: tmp })
  } finally {
    restoreEnv(previous)
  }
}

async function scanBrandLeakage(base: string, customTargets?: string[]): Promise<{ schema: string; ok: boolean; scanned_files: number; redacted_offenders: string[]; forbidden_term_hashes: string[] }> {
  const terms = forbiddenTerms()
  const targets = customTargets || ['src/core', 'src/scripts', 'docs', 'README.md', 'CHANGELOG.md', 'package.json', 'release-gates.v2.json', 'schemas']
  const files = targets.flatMap((target) => {
    const full = path.join(base, target)
    if (!fs.existsSync(full)) return []
    return fs.statSync(full).isDirectory() ? listFiles(full) : [full]
  }).filter((file) => !/\/(?:node_modules|dist|\.git)\//.test(file))
  const offenders: string[] = []
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf8')
    for (const term of terms) {
      if (term && text.toLowerCase().includes(term.toLowerCase())) {
        offenders.push(`${path.relative(base, file)}#${hash(term).slice(0, 12)}`)
      }
    }
  }
  return {
    schema: 'sks.brand-neutrality-zero-leakage.v1',
    ok: offenders.length === 0,
    scanned_files: files.length,
    redacted_offenders: offenders,
    forbidden_term_hashes: terms.map((term) => hash(term))
  }
}

function forbiddenTerms(): string[] {
  const raw = process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean)
    } catch {}
    return raw.split(/[,;\n]/).map((term) => term.trim()).filter(Boolean)
  }
  return ['bGF6eWNvZGV4', 'b3BlbmNsYXc=', 'aGVybWVz', 'b2gtbXktb3BlbmFnZW50', 'c2lzeXBodXNsYWJz'].map((value) => Buffer.from(value, 'base64').toString('utf8'))
}

function fakeEnv(opts: { hook: 'approved' | 'unknown' }): Record<string, string | undefined> {
  return swapEnv({
    SKS_CODEX_PLUGIN_JSON_FAKE: '1',
    SKS_CODEX_HOOK_APPROVAL_FIXTURE: opts.hook,
    CODEX_BIN: 'codex'
  })
}

function swapEnv(values: Record<string, string>): Record<string, string | undefined> {
  const previous: Record<string, string | undefined> = {}
  for (const [key, value] of Object.entries(values)) {
    previous[key] = process.env[key]
    process.env[key] = value
  }
  return previous
}

function restoreEnv(previous: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
}

async function tempRoot(id: string): Promise<string> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), `${id.replace(/[^a-z0-9-]/gi, '-')}-`))
  await fsp.mkdir(path.join(dir, '.sneakoscope', 'reports'), { recursive: true })
  await fsp.mkdir(path.join(dir, 'docs'), { recursive: true })
  await fsp.writeFile(path.join(dir, 'package.json'), '{"name":"fixture","version":"3.1.6","scripts":{}}\n', 'utf8')
  return dir
}

function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (current: string): void => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile()) out.push(full)
    }
  }
  if (fs.existsSync(dir)) walk(dir)
  return out.filter((file) => /\.(ts|js|json|md|txt|toml|ya?ml)$/i.test(file))
}

async function importDist(rel: string): Promise<Record<string, any>> {
  const absolute = path.join(root, 'dist', rel)
  assertGate(fs.existsSync(absolute), `dist module missing:${rel}`, { hint: 'run npm run build first' })
  return import(pathToFileURL(absolute).href) as Promise<Record<string, any>>
}

function readText(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8')
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(name: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate: name, ...detail }, null, 2))
}

export function checkCommand(command: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(command, args, { cwd: root, encoding: 'utf8', timeout: 120_000 })
  return { status: result.status, stdout: result.stdout || '', stderr: result.stderr || '' }
}

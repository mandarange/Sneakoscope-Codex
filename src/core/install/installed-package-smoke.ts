import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess, writeJsonAtomic } from '../fsx.js'

export interface InstalledPackageSmokeOptions {
  tarball?: string
  receipt?: string
  expectedSha256?: string
  keepTemp?: boolean
}

export interface InstalledPackageSmokeReport {
  schema: 'sks.installed-package-smoke.v1'
  ok: boolean
  generated_at: string
  tarball: string | null
  tarball_sha256: string | null
  tarball_binding: {
    source: 'generated' | 'provided'
    receipt: string | null
    expected_sha256: string | null
    exact_match: boolean
  }
  installed_version: string | null
  temp_dir: string
  install_prefix: string
  commands: Array<{
    probe: string
    exit_code: number | null
    stdout_json: boolean
    duration_ms: number
  }>
  public_surface: {
    command_manifest_count: number
    dollar_manifest_count: number
    required_commands: string[]
    required_dollar_commands: string[]
    closure: InstalledSurfaceClosureSummary
  }
  forbidden_findings: string[]
  blockers: string[]
}

export const INSTALLED_REQUIRED_COMMANDS = ['naruto', 'mcp', 'update', 'menubar'] as const
export const INSTALLED_REQUIRED_DOLLAR_COMMANDS = ['$Naruto', '$Work'] as const
export const INSTALLED_REMOVED_COMMANDS = ['team', 'mad-db', 'tmux', 'xai', 'swarm', 'agent'] as const
export const INSTALLED_REMOVED_DOLLAR_COMMANDS = ['$Agent', '$Team', '$MAD-DB', '$Swarm', '$ShadowClone', '$Kagebunshin'] as const

type InstalledSurfaceRejectionReason = 'unknown_command' | 'unsupported_argument'

export interface InstalledSurfaceClosureProbe {
  expected_reason: InstalledSurfaceRejectionReason
  exit_code: number | null
  observed_reason: InstalledSurfaceRejectionReason | null
  ok: boolean
}

export interface InstalledPackageSmokeRawCommand {
  argv: string[]
  exit_code: number | null
  stdout_json: boolean
  duration_ms: number
  stdout_tail: string
  stderr_tail: string
}

export interface InstalledSurfaceClosureSummary {
  command_probe_count: number
  dollar_command_probe_count: number
  argument_probe_count: number
  rejected_count: number
  expected_reason_counts: Record<InstalledSurfaceRejectionReason, number>
  observed_reason_counts: Record<InstalledSurfaceRejectionReason | 'other', number>
  all_rejected: boolean
  receipt_safe: boolean
}

export async function runInstalledPackageSmoke(
  root: string,
  options: InstalledPackageSmokeOptions = {}
): Promise<InstalledPackageSmokeReport> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-installed-smoke-'))
  const home = path.join(tmp, 'home')
  const codexHome = path.join(tmp, 'codex-home')
  const npmCache = path.join(tmp, 'npm-cache')
  const installPrefix = path.join(tmp, 'prefix')
  const packDestination = path.join(tmp, 'pack')
  await Promise.all([home, codexHome, npmCache, installPrefix, packDestination, path.join(home, '.tmp')]
    .map((dir) => fs.mkdir(dir, { recursive: true })))
  const blockers: string[] = []
  const commands: InstalledPackageSmokeReport['commands'] = []
  let tarball: string | null = null
  let tarballSha256: string | null = null
  let installedVersion: string | null = null
  let packedVersion: string | null = null
  let expectedSha256 = normalizeSha256(options.expectedSha256)
  let receiptPath: string | null = null
  if (options.expectedSha256 && !expectedSha256) blockers.push('expected_sha256_invalid')
  if (options.receipt && !options.tarball) blockers.push('receipt_requires_tarball')

  if (options.tarball) {
    tarball = path.resolve(root, options.tarball)
    const validation = await validateProvidedTarball(tarball)
    blockers.push(...validation.blockers)
    tarballSha256 = validation.sha256
    if (options.receipt) {
      receiptPath = path.resolve(root, options.receipt)
      const binding = await readReceiptBinding(receiptPath, tarball)
      blockers.push(...binding.blockers)
      if (binding.sha256) {
        if (expectedSha256 && expectedSha256 !== binding.sha256) blockers.push('expected_sha256_receipt_mismatch')
        expectedSha256 = expectedSha256 || binding.sha256
      }
      packedVersion = binding.version
    }
    if (!expectedSha256) blockers.push('provided_tarball_binding_missing')
  } else {
    const pack = await runJsonCommand(root, [
      'npm', 'pack', '--json', '--ignore-scripts', '--pack-destination', packDestination
    ], { npmCache })
    commands.push(summarizeInstalledSmokeCommand(pack.command, 'pack'))
    if (pack.exit_code !== 0) blockers.push('npm_pack_failed')
    const packInfo = packJsonObject(pack.json)
    if (packInfo?.filename) tarball = path.join(packDestination, String(packInfo.filename))
    if (packInfo?.version) packedVersion = String(packInfo.version)
    if (!tarball) blockers.push('npm_pack_tarball_missing')
    else {
      const validation = await validateProvidedTarball(tarball)
      blockers.push(...validation.blockers)
      tarballSha256 = validation.sha256
      expectedSha256 = expectedSha256 || tarballSha256
    }
  }

  if (tarball && blockers.length === 0) {
    const install = await runJsonCommand(tmp, [
      'npm', 'install', '--global', '--prefix', installPrefix, '--ignore-scripts', '--no-audit', '--no-fund', tarball
    ], { home, codexHome, npmCache })
    commands.push(summarizeInstalledSmokeCommand(install.command, 'install'))
    if (install.exit_code !== 0) blockers.push('npm_install_tarball_failed')
  }

  const bin = process.platform === 'win32'
    ? path.join(installPrefix, 'sks.cmd')
    : path.join(installPrefix, 'bin', 'sks')
  const smokeCommands: Array<{ name: string; argv: string[]; diagnostic?: boolean }> = [
    { name: 'version', argv: [bin, '--version'] },
    { name: 'commands', argv: [bin, 'commands', '--json'] },
    { name: 'dollar-commands', argv: [bin, 'dollar-commands', '--json'] },
    { name: 'bootstrap', argv: [bin, 'bootstrap', '--json'] },
    { name: 'doctor', argv: [bin, 'doctor', '--json'] },
    { name: 'naruto', argv: [bin, 'naruto', '--help'], diagnostic: true },
    { name: 'mcp', argv: [bin, 'mcp', 'config', 'list', '--scope', 'effective', '--trusted-project', '--json'], diagnostic: true },
    { name: 'update', argv: [bin, 'update', 'status', '--json'], diagnostic: true },
    ...(process.platform === 'darwin'
      ? [{ name: 'menubar-install', argv: [bin, 'menubar', 'install', '--no-launch', '--json'] }]
      : []),
    { name: 'menubar', argv: [bin, 'menubar', 'status', '--json'], diagnostic: true },
    { name: 'super-search', argv: [bin, 'super-search', 'doctor', '--json'] },
    { name: 'selftest', argv: [bin, 'selftest', '--mock'] }
  ]
  let commandManifest: unknown = null
  let dollarManifest: unknown = null
  for (const { name, argv, diagnostic } of smokeCommands) {
    const result = await runJsonCommand(tmp, argv, { home, codexHome, npmCache })
    commands.push(summarizeInstalledSmokeCommand(result.command, name))
    const diagnosticBlockers = diagnostic ? installedDiagnosticBlockers(name, result, process.platform) : []
    if (result.exit_code !== 0 && diagnosticBlockers.length === 0 && name !== 'menubar') {
      blockers.push(`installed_command_failed:${name}`)
    }
    blockers.push(...diagnosticBlockers)
    if (name === 'commands') commandManifest = result.json
    if (name === 'dollar-commands') dollarManifest = result.json
    if (argv.includes('--version')) {
      const match = String(result.stdout || '').match(/([0-9]+\.[0-9]+\.[0-9]+)/)
      if (match) installedVersion = match[1] || null
    }
  }

  const surface = validateInstalledPublicSurface(commandManifest, dollarManifest)
  blockers.push(...surface.blockers)
  const closureProbes: InstalledSurfaceClosureProbe[] = []
  const retiredSurfaceValues = [...INSTALLED_REMOVED_COMMANDS, ...INSTALLED_REMOVED_DOLLAR_COMMANDS]
  for (const value of retiredSurfaceValues) {
    const result = await runJsonCommand(tmp, [bin, value, '--json'], { home, codexHome, npmCache })
    const observed = rejectionReason(result)
    const ok = result.exit_code !== 0 && observed === 'unknown_command'
    closureProbes.push({ expected_reason: 'unknown_command', exit_code: result.exit_code, observed_reason: observed, ok })
    commands.push(sanitizeInstalledSurfaceProbeCommand(result.command, closureProbes.length, observed))
    if (!ok) blockers.push(`installed_surface_closure_probe_failed:${closureProbes.length}`)
  }
  const agentOption = await runJsonCommand(tmp, [bin, 'naruto', '--agent', 'worker', '--help'], { home, codexHome, npmCache })
  const agentReason = rejectionReason(agentOption)
  const agentRejected = agentOption.exit_code !== 0 && agentReason === 'unsupported_argument'
  closureProbes.push({ expected_reason: 'unsupported_argument', exit_code: agentOption.exit_code, observed_reason: agentReason, ok: agentRejected })
  commands.push(sanitizeInstalledSurfaceProbeCommand(agentOption.command, closureProbes.length, agentReason))
  if (!agentRejected) blockers.push(`installed_surface_closure_probe_failed:${closureProbes.length}`)
  const closure = summarizeInstalledSurfaceClosure(closureProbes)

  const forbiddenFindings: string[] = []
  if (process.env.HOME && home === process.env.HOME) forbiddenFindings.push('host_home_reused')
  if (process.env.CODEX_HOME && codexHome === process.env.CODEX_HOME) forbiddenFindings.push('host_codex_home_reused')
  if (tarballSha256 && expectedSha256 && tarballSha256 !== expectedSha256) blockers.push('tarball_sha256_mismatch')
  if (packedVersion && installedVersion && packedVersion !== installedVersion) blockers.push(`installed_version_mismatch:${installedVersion}:expected_${packedVersion}`)
  blockers.push(...forbiddenFindings.map((item) => `forbidden:${item}`))

  const report: InstalledPackageSmokeReport = {
    schema: 'sks.installed-package-smoke.v1',
    ok: blockers.length === 0,
    generated_at: new Date().toISOString(),
    tarball,
    tarball_sha256: tarballSha256,
    tarball_binding: {
      source: options.tarball ? 'provided' : 'generated',
      receipt: receiptPath,
      expected_sha256: expectedSha256,
      exact_match: Boolean(tarballSha256 && expectedSha256 && tarballSha256 === expectedSha256)
    },
    installed_version: installedVersion,
    temp_dir: tmp,
    install_prefix: installPrefix,
    commands,
    public_surface: {
      command_manifest_count: surface.commandCount,
      dollar_manifest_count: surface.dollarCount,
      required_commands: [...INSTALLED_REQUIRED_COMMANDS],
      required_dollar_commands: [...INSTALLED_REQUIRED_DOLLAR_COMMANDS],
      closure
    },
    forbidden_findings: forbiddenFindings,
    blockers: [...new Set(blockers)]
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'installed-package-smoke.json'), report)
  if (report.ok && !options.keepTemp) await fs.rm(tmp, { recursive: true, force: true })
  return report
}

async function validateProvidedTarball(tarball: string): Promise<{ sha256: string | null; blockers: string[] }> {
  const blockers: string[] = []
  try {
    const stat = await fs.lstat(tarball)
    if (!stat.isFile()) blockers.push('tarball_not_regular_file')
    if (stat.isSymbolicLink()) blockers.push('tarball_symlink_refused')
    const bytes = await fs.readFile(tarball)
    return { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), blockers }
  } catch {
    return { sha256: null, blockers: ['tarball_missing_or_unreadable'] }
  }
}

async function readReceiptBinding(receipt: string, tarball: string): Promise<{
  sha256: string | null
  version: string | null
  blockers: string[]
}> {
  try {
    const parsed = JSON.parse(await fs.readFile(receipt, 'utf8')) as Record<string, unknown>
    const blockers: string[] = []
    const sha256 = normalizeSha256(parsed.sha256)
    const version = typeof parsed.package_version === 'string' ? parsed.package_version : null
    if (parsed.schema !== 'sks.release-pack-receipt.v1' || parsed.ok !== true) blockers.push('pack_receipt_invalid')
    if (!sha256) blockers.push('pack_receipt_sha256_invalid')
    if (path.basename(String(parsed.tarball_path || parsed.tarball_name || '')) !== path.basename(tarball)) {
      blockers.push('pack_receipt_tarball_name_mismatch')
    }
    return { sha256, version, blockers }
  } catch {
    return { sha256: null, version: null, blockers: ['pack_receipt_missing_or_unreadable'] }
  }
}

function normalizeSha256(value: unknown): string | null {
  const normalized = String(value || '').trim().toLowerCase()
  return /^[a-f0-9]{64}$/.test(normalized) ? normalized : null
}

async function runJsonCommand(cwd: string, argv: string[], opts: {
  home?: string
  codexHome?: string
  npmCache?: string
}): Promise<{ exit_code: number | null; stdout: string; json: unknown; command: InstalledPackageSmokeRawCommand }> {
  const started = Date.now()
  const [command, ...args] = argv
  const env: NodeJS.ProcessEnv = {
    SKS_TEST_ISOLATION: '1',
    SKS_DISABLE_NETWORK: '1',
    SKS_DISABLE_UPDATE_CHECK: '1',
    ...(opts.home ? {
      SKS_GLOBAL_ROOT: path.join(opts.home, '.sneakoscope-global'),
      TMPDIR: path.join(opts.home, '.tmp')
    } : {})
  }
  if (opts.home !== undefined) env.HOME = opts.home
  if (opts.codexHome !== undefined) env.CODEX_HOME = opts.codexHome
  if (opts.npmCache !== undefined) {
    env.npm_config_cache = opts.npmCache
    env.NPM_CONFIG_CACHE = opts.npmCache
  }
  const res = await runProcess(command || 'node', args, {
    cwd,
    timeoutMs: 120_000,
    maxOutputBytes: 1024 * 1024,
    env
  })
  let parsed: unknown = null
  parsed = parseJsonOutput(res.stdout)
  return {
    exit_code: res.code,
    stdout: res.stdout,
    json: parsed,
    command: {
      argv,
      exit_code: res.code,
      stdout_json: parsed != null,
      duration_ms: Date.now() - started,
      stdout_tail: res.stdout.slice(-1200),
      stderr_tail: res.stderr.slice(-1200)
    }
  }
}

export function validateInstalledPublicSurface(commandManifest: unknown, dollarManifest: unknown): {
  commandCount: number
  dollarCount: number
  blockers: string[]
} {
  const commands = Array.isArray((commandManifest as any)?.commands)
    ? (commandManifest as any).commands.map((row: any) => String(row?.name || '')) : []
  const dollarCommands = Array.isArray((dollarManifest as any)?.dollar_commands)
    ? (dollarManifest as any).dollar_commands.map((row: any) => String(row?.command || '')) : []
  const appSkills = Array.isArray((dollarManifest as any)?.app_skill_aliases)
    ? (dollarManifest as any).app_skill_aliases.map((row: any) => String(row?.app_skill || '')) : []
  const blockers: string[] = []
  for (const value of INSTALLED_REQUIRED_COMMANDS) if (!commands.includes(value)) blockers.push(`installed_command_manifest_missing:${value}`)
  for (const value of INSTALLED_REQUIRED_DOLLAR_COMMANDS) if (!dollarCommands.includes(value)) blockers.push(`installed_dollar_manifest_missing:${value}`)
  for (const [index, value] of INSTALLED_REMOVED_COMMANDS.entries()) {
    if (commands.includes(value)) blockers.push(`installed_command_manifest_contains_non_current:${index + 1}`)
  }
  for (const [index, value] of INSTALLED_REMOVED_DOLLAR_COMMANDS.entries()) {
    if (dollarCommands.includes(value) || appSkills.includes(value.toLowerCase())) {
      blockers.push(`installed_dollar_manifest_contains_non_current:${index + 1}`)
    }
  }
  return { commandCount: commands.length, dollarCount: dollarCommands.length, blockers }
}

export function summarizeInstalledSurfaceClosure(probes: readonly InstalledSurfaceClosureProbe[]): InstalledSurfaceClosureSummary {
  const expectedReasonCounts: InstalledSurfaceClosureSummary['expected_reason_counts'] = {
    unknown_command: 0,
    unsupported_argument: 0
  }
  const observedReasonCounts: InstalledSurfaceClosureSummary['observed_reason_counts'] = {
    unknown_command: 0,
    unsupported_argument: 0,
    other: 0
  }
  for (const probe of probes) {
    expectedReasonCounts[probe.expected_reason] += 1
    if (probe.observed_reason) observedReasonCounts[probe.observed_reason] += 1
    else observedReasonCounts.other += 1
  }
  const commandProbeCount = INSTALLED_REMOVED_COMMANDS.length
  const dollarCommandProbeCount = INSTALLED_REMOVED_DOLLAR_COMMANDS.length
  const argumentProbeCount = Math.max(0, probes.length - commandProbeCount - dollarCommandProbeCount)
  const allRejected = probes.length > 0 && probes.every((probe) => probe.ok)
  return {
    command_probe_count: commandProbeCount,
    dollar_command_probe_count: dollarCommandProbeCount,
    argument_probe_count: argumentProbeCount,
    rejected_count: probes.filter((probe) => probe.ok).length,
    expected_reason_counts: expectedReasonCounts,
    observed_reason_counts: observedReasonCounts,
    all_rejected: allRejected,
    receipt_safe: allRejected
  }
}

export function sanitizeInstalledSurfaceProbeCommand(
  command: InstalledPackageSmokeRawCommand,
  index: number,
  _observedReason: InstalledSurfaceRejectionReason | null
): InstalledPackageSmokeReport['commands'][number] {
  return summarizeInstalledSmokeCommand(command, `current_surface_closure_${String(index).padStart(2, '0')}`)
}

export function summarizeInstalledSmokeCommand(
  command: InstalledPackageSmokeRawCommand,
  probe: string
): InstalledPackageSmokeReport['commands'][number] {
  return {
    probe,
    exit_code: command.exit_code,
    stdout_json: command.stdout_json,
    duration_ms: command.duration_ms
  }
}

export function retiredSurfaceTokenFindings(text: string): number[] {
  const findings: number[] = []
  const values = [...INSTALLED_REMOVED_COMMANDS, ...INSTALLED_REMOVED_DOLLAR_COMMANDS, '--agent']
  for (const [index, value] of values.entries()) {
    if (containsRetiredSurfaceToken(text, value)) findings.push(index + 1)
  }
  return findings
}

function containsRetiredSurfaceToken(text: string, value: string): boolean {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (value === '--agent') return new RegExp(`${escaped}(?=$|[\\s"'=:,}\\]])`).test(text)
  if (value.startsWith('$')) return new RegExp(`${escaped}(?![A-Za-z0-9_-])`).test(text)
  return new RegExp(`(?<![A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`, 'i').test(text)
}

function installedDiagnosticBlockers(
  name: string,
  result: Awaited<ReturnType<typeof runJsonCommand>>,
  platform: NodeJS.Platform
): string[] {
  if (name === 'naruto') return result.exit_code === 0 && /\$Naruto/.test(result.stdout)
    ? [] : ['installed_diagnostic_failed:naruto']
  const expectedSchema: Record<string, string> = {
    mcp: 'sks.mcp-inventory.v2',
    update: 'sks.update-status.v3',
    menubar: 'sks.menubar-status.v1'
  }
  const schema = String((result.json as any)?.schema || '')
  if (schema !== expectedSchema[name]) return [`installed_diagnostic_schema_invalid:${name}`]
  if (name === 'menubar') return validateInstalledMenubarStatus(result.json, platform)
  return result.exit_code === 0 ? [] : [`installed_diagnostic_failed:${name}`]
}

export function validateInstalledMenubarStatus(value: unknown, platform: NodeJS.Platform): string[] {
  if (platform !== 'darwin') return []
  const status = value as any
  return status?.installed === true && status?.signature?.ok === true && status?.resources?.ok === true
    ? []
    : ['installed_diagnostic_failed:menubar']
}

function rejectionReason(result: Awaited<ReturnType<typeof runJsonCommand>>): InstalledSurfaceRejectionReason | null {
  const jsonReason = String((result.json as any)?.reason || '')
  if (jsonReason === 'unknown_command' || jsonReason === 'unsupported_argument') return jsonReason
  const text = `${result.stdout}\n${result.command.stderr_tail}`
  if (/unsupported_argument:--agent/.test(text)) return 'unsupported_argument'
  if (/unknown_command|Unknown command:/i.test(text)) return 'unknown_command'
  return null
}

function parseJsonOutput(value: string): unknown {
  const text = String(value || '').trim()
  for (const candidate of [text, text.slice(Math.max(0, text.indexOf('{'))), text.slice(Math.max(0, text.indexOf('[')))]) {
    if (!candidate) continue
    try { return JSON.parse(candidate) } catch {}
  }
  return null
}

function packJsonObject(value: unknown): { filename?: string; version?: string } | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? row as { filename?: string; version?: string } : null
}

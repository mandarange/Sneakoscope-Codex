import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess, writeJsonAtomic } from '../fsx.js'

export interface InstalledPackageSmokeReport {
  schema: 'sks.installed-package-smoke.v1'
  ok: boolean
  generated_at: string
  tarball: string | null
  installed_version: string | null
  temp_dir: string
  commands: Array<{
    argv: string[]
    exit_code: number | null
    stdout_json: boolean
    duration_ms: number
    stdout_tail: string
    stderr_tail: string
  }>
  forbidden_findings: string[]
  blockers: string[]
}

export async function runInstalledPackageSmoke(root: string): Promise<InstalledPackageSmokeReport> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-installed-smoke-'))
  const home = path.join(tmp, 'home')
  const codexHome = path.join(tmp, 'codex-home')
  const npmCache = path.join(tmp, 'npm-cache')
  await Promise.all([home, codexHome, npmCache].map((dir) => fs.mkdir(dir, { recursive: true })))
  const blockers: string[] = []
  const commands: InstalledPackageSmokeReport['commands'] = []
  let tarball: string | null = null
  let installedVersion: string | null = null
  let packedVersion: string | null = null

  const pack = await runJsonCommand(root, ['npm', 'pack', '--json', '--ignore-scripts'], { npmCache })
  commands.push(pack.command)
  if (pack.exit_code !== 0) blockers.push('npm_pack_failed')
  const packInfo = packJsonObject(pack.json)
  if (packInfo?.filename) tarball = path.join(root, String(packInfo.filename))
  if (packInfo?.version) packedVersion = String(packInfo.version)
  if (!tarball) blockers.push('npm_pack_tarball_missing')

  await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ private: true, type: 'module' }, null, 2))
  if (tarball) {
    const install = await runJsonCommand(tmp, ['npm', 'install', tarball, '--ignore-scripts'], { home, codexHome, npmCache })
    commands.push(install.command)
    if (install.exit_code !== 0) blockers.push('npm_install_tarball_failed')
  }

  const bin = path.join(tmp, 'node_modules', '.bin', 'sks')
  const smokeCommands = [
    [bin, '--version'],
    [bin, 'commands', '--json'],
    [bin, 'bootstrap', '--json'],
    [bin, 'doctor', '--json'],
    [bin, 'super-search', 'doctor', '--json'],
    [bin, 'selftest', '--mock']
  ]
  for (const argv of smokeCommands) {
    const result = await runJsonCommand(tmp, argv, { home, codexHome, npmCache })
    commands.push(result.command)
    if (result.exit_code !== 0) blockers.push(`installed_command_failed:${argv.slice(1).join('_') || 'version'}`)
    if (argv.includes('--version')) {
      const match = String(result.stdout || '').match(/([0-9]+\.[0-9]+\.[0-9]+)/)
      if (match) installedVersion = match[1] || null
    }
  }

  const forbiddenFindings: string[] = []
  if (process.env.HOME && home === process.env.HOME) forbiddenFindings.push('host_home_reused')
  if (process.env.CODEX_HOME && codexHome === process.env.CODEX_HOME) forbiddenFindings.push('host_codex_home_reused')
  if (packedVersion && installedVersion && packedVersion !== installedVersion) blockers.push(`installed_version_mismatch:${installedVersion}:expected_${packedVersion}`)
  blockers.push(...forbiddenFindings.map((item) => `forbidden:${item}`))

  const report: InstalledPackageSmokeReport = {
    schema: 'sks.installed-package-smoke.v1',
    ok: blockers.length === 0,
    generated_at: new Date().toISOString(),
    tarball,
    installed_version: installedVersion,
    temp_dir: tmp,
    commands,
    forbidden_findings: forbiddenFindings,
    blockers: [...new Set(blockers)]
  }
  await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'installed-package-smoke.json'), report)
  return report
}

async function runJsonCommand(cwd: string, argv: string[], opts: {
  home?: string
  codexHome?: string
  npmCache?: string
}): Promise<{ exit_code: number | null; stdout: string; json: unknown; command: InstalledPackageSmokeReport['commands'][number] }> {
  const started = Date.now()
  const [command, ...args] = argv
  const env: NodeJS.ProcessEnv = {
    SKS_TEST_ISOLATION: '1',
    SKS_DISABLE_NETWORK: '1',
    SKS_DISABLE_UPDATE_CHECK: '1'
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
  try {
    parsed = JSON.parse(res.stdout)
  } catch {}
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

function packJsonObject(value: unknown): { filename?: string; version?: string } | null {
  const row = Array.isArray(value) ? value[0] : value
  return row && typeof row === 'object' ? row as { filename?: string; version?: string } : null
}

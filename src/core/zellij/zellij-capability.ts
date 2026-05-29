import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { compareVersionLike, parseZellijVersionText, runZellij } from './zellij-command.js'

export const ZELLIJ_CAPABILITY_SCHEMA = 'sks.zellij-capability.v1'
export const ZELLIJ_MIN_VERSION = '0.41.0'

export interface ZellijCapabilityReport {
  schema: typeof ZELLIJ_CAPABILITY_SCHEMA
  generated_at: string
  ok: boolean
  status: 'ok' | 'missing' | 'too_old' | 'blocked'
  integration_optional: boolean
  require_zellij: boolean
  min_version: string
  version: string | null
  bin: 'zellij'
  command: string[]
  docs_evidence: string[]
  blockers: string[]
  warnings: string[]
  operator_actions: string[]
}

export async function checkZellijCapability(opts: { root?: string; require?: boolean; writeReport?: boolean } = {}): Promise<ZellijCapabilityReport> {
  const requireZellij = opts.require === true || process.env.SKS_REQUIRE_ZELLIJ === '1'
  const versionRun = await runZellij(['--version'], { optional: !requireZellij, timeoutMs: 5000 })
  const versionText = `${versionRun.stdout_tail}\n${versionRun.stderr_tail}`.trim()
  const version = parseZellijVersionText(versionText)
  const missing = !versionRun.ok && versionRun.blockers.includes('zellij_missing')
  const tooOld = Boolean(version && compareVersionLike(version, ZELLIJ_MIN_VERSION) < 0)
  const status: ZellijCapabilityReport['status'] = missing
    ? 'missing'
    : tooOld
      ? 'too_old'
      : versionRun.ok
        ? 'ok'
        : 'blocked'
  const blockers = [
    ...(requireZellij && status === 'missing' ? ['zellij_missing_required'] : []),
    ...(requireZellij && status === 'too_old' ? ['zellij_too_old_required'] : []),
    ...(requireZellij && status === 'blocked' ? ['zellij_version_probe_failed_required'] : [])
  ]
  const warnings = [
    ...(!requireZellij && status === 'missing' ? ['zellij_missing_optional_integration'] : []),
    ...(!requireZellij && status === 'too_old' ? ['zellij_too_old_optional_integration'] : []),
    ...(!requireZellij && status === 'blocked' ? ['zellij_probe_failed_optional_integration'] : [])
  ]
  const report: ZellijCapabilityReport = {
    schema: ZELLIJ_CAPABILITY_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    status,
    integration_optional: !requireZellij,
    require_zellij: requireZellij,
    min_version: ZELLIJ_MIN_VERSION,
    version,
    bin: 'zellij',
    command: ['zellij', '--version'],
    docs_evidence: [
      'https://zellij.dev/documentation/command-line-options.html',
      'https://zellij.dev/documentation/programmatic-control.html',
      'https://zellij.dev/documentation/layouts.html',
      'https://zellij.dev/documentation/cli-actions.html'
    ],
    blockers,
    warnings,
    operator_actions: status === 'ok' ? [] : ['Install Zellij. On macOS: `brew install zellij`.']
  }
  if (opts.writeReport !== false) {
    const root = opts.root || process.cwd()
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'zellij-capability.json'), report)
  }
  return report
}

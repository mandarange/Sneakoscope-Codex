import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { compareVersionLike, parseZellijVersionText, runZellij } from './zellij-command.js'

export const ZELLIJ_CAPABILITY_SCHEMA = 'sks.zellij-capability.v1'
export const ZELLIJ_MIN_VERSION = '0.41.0'
export const ZELLIJ_STACKED_PANE_CAPABILITY_SCHEMA = 'sks.zellij-stacked-pane-capability.v1'
export const ZELLIJ_STACKED_PANE_MIN_VERSION = '0.43.0'

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

export interface ZellijStackedPaneCapability {
  schema: typeof ZELLIJ_STACKED_PANE_CAPABILITY_SCHEMA
  ok: boolean
  zellij_bin: string | null
  version_text: string | null
  parsed_version: string | null
  supports_stacked_panes: boolean
  requires_update: boolean
  fallback_mode: 'native-stacked' | 'down-split-stack-emulation' | 'headless-only'
  blockers: string[]
}

export function zellijSupportsStackedPanes(version: string | null): boolean {
  const parsed = parseZellijVersionText(version)
  return Boolean(parsed && compareVersionLike(parsed, ZELLIJ_STACKED_PANE_MIN_VERSION) >= 0)
}

export function resolveZellijStackedPaneCapability(input: {
  ok?: boolean
  zellijBin?: string | null
  versionText?: string | null
  blockers?: string[]
} = {}): ZellijStackedPaneCapability {
  const versionText = input.versionText == null ? null : String(input.versionText)
  const parsedVersion = parseZellijVersionText(versionText)
  const supports = zellijSupportsStackedPanes(parsedVersion)
  const blockers = [...(input.blockers || [])].map(String)
  const zellijMissing = blockers.includes('zellij_missing') || blockers.includes('zellij_missing_required')
  if (!parsedVersion && !zellijMissing && input.ok === false) blockers.push('zellij_version_unparsed')
  return {
    schema: ZELLIJ_STACKED_PANE_CAPABILITY_SCHEMA,
    ok: blockers.length === 0 && supports,
    zellij_bin: input.zellijBin === undefined ? 'zellij' : input.zellijBin,
    version_text: versionText,
    parsed_version: parsedVersion,
    supports_stacked_panes: supports,
    requires_update: Boolean(parsedVersion && !supports),
    fallback_mode: supports ? 'native-stacked' : zellijMissing ? 'headless-only' : 'down-split-stack-emulation',
    blockers
  }
}

export async function checkZellijStackedPaneCapability(opts: { writeReport?: boolean; root?: string; env?: NodeJS.ProcessEnv } = {}): Promise<ZellijStackedPaneCapability> {
  const runOpts: { optional: boolean; timeoutMs: number; env?: NodeJS.ProcessEnv } = { optional: true, timeoutMs: 5000 }
  if (opts.env !== undefined) runOpts.env = opts.env
  const versionRun = await runZellij(['--version'], runOpts)
  const versionText = `${versionRun.stdout_tail}\n${versionRun.stderr_tail}`.trim()
  const report = resolveZellijStackedPaneCapability({
    ok: versionRun.ok,
    zellijBin: 'zellij',
    versionText,
    blockers: versionRun.ok ? [] : versionRun.blockers
  })
  if (opts.writeReport !== false) {
    const root = opts.root || process.cwd()
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'zellij-stacked-pane-capability.json'), report)
  }
  return report
}

export async function checkZellijCapability(opts: { root?: string; require?: boolean; writeReport?: boolean; env?: NodeJS.ProcessEnv } = {}): Promise<ZellijCapabilityReport> {
  const env = opts.env || process.env
  const requireZellij = opts.require === true || env.SKS_REQUIRE_ZELLIJ === '1'
  if (env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS) {
    const fakeStatus = String(env.SKS_ZELLIJ_CAPABILITY_FAKE_STATUS)
    const status: ZellijCapabilityReport['status'] = fakeStatus === 'ok' || fakeStatus === 'missing' || fakeStatus === 'too_old' || fakeStatus === 'blocked' ? fakeStatus : 'blocked'
    const report: ZellijCapabilityReport = {
      schema: ZELLIJ_CAPABILITY_SCHEMA,
      generated_at: nowIso(),
      ok: status === 'ok',
      status,
      integration_optional: !requireZellij,
      require_zellij: requireZellij,
      min_version: ZELLIJ_MIN_VERSION,
      version: status === 'missing' ? null : String(env.SKS_ZELLIJ_CAPABILITY_FAKE_VERSION || '0.40.0'),
      bin: 'zellij',
      command: ['zellij', '--version'],
      docs_evidence: [],
      blockers: requireZellij && status !== 'ok' ? [`zellij_${status}_required`] : [],
      warnings: !requireZellij && status !== 'ok' ? [`zellij_${status}_optional_integration`] : [],
      operator_actions: status === 'ok' ? [] : ['Install Zellij. On macOS: `brew install zellij`.']
    }
    if (opts.writeReport !== false) {
      const root = opts.root || process.cwd()
      await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'zellij-capability.json'), report)
    }
    return report
  }
  const versionRun = await runZellij(['--version'], { optional: !requireZellij, timeoutMs: 5000, env })
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

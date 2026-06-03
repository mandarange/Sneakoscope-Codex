import path from 'node:path'
import { nowIso, writeJsonAtomic } from '../fsx.js'
import { buildProviderBadge } from '../provider/provider-badge.js'
import { resolveProviderContext, type ProviderContext } from '../provider/provider-context.js'

export const CODEX_APP_PROVIDER_BADGE_SCHEMA = 'sks.codex-app-provider-badge.v1'

export async function buildCodexAppProviderBadgeStatus(root: string = process.cwd(), input: {
  providerContext?: ProviderContext | null
  officialCapability?: boolean | null
  reportPath?: string | null
} = {}) {
  const providerContext = input.providerContext || await resolveProviderContext({ root })
  const badge = buildProviderBadge(providerContext)
  const nativeSupported = input.officialCapability === true
  const blockers = [
    ...badge.blockers,
    ...(nativeSupported ? [] : [])
  ]
  const report = {
    schema: CODEX_APP_PROVIDER_BADGE_SCHEMA,
    generated_at: nowIso(),
    ok: blockers.length === 0,
    native_app_badge_supported: nativeSupported,
    native_app_badge_status: nativeSupported ? 'available' : 'unsupported',
    native_app_badge_reason: nativeSupported ? null : 'Codex App native badge surface is not exposed through an official local API.',
    private_app_mutation: false,
    badge_text: badge.text,
    fallback_surfaces: nativeSupported ? [] : ['sks status', 'doctor --json', 'Zellij pane title/footer', 'command hint'],
    provider_context: providerContext,
    blockers
  }
  if (input.reportPath) await writeJsonAtomic(input.reportPath, report)
  return report
}

export async function writeCodexAppProviderBadgeReport(root: string = process.cwd(), input: Parameters<typeof buildCodexAppProviderBadgeStatus>[1] = {}) {
  const reportPath = input.reportPath || path.join(path.resolve(root), '.sneakoscope', 'reports', 'codex-app-provider-badge.json')
  return buildCodexAppProviderBadgeStatus(root, { ...input, reportPath })
}

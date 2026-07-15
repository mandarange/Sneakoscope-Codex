#!/usr/bin/env node
import { buildCodexAppProviderBadgeStatus } from '../core/codex-app/codex-app-provider-badge.js'
import type { ProviderContext } from '../core/provider/provider-context.js'

const providerContext: ProviderContext = {
  schema: 'sks.provider-context.v1',
  generated_at: new Date().toISOString(),
  provider: 'codex-lb',
  auth_mode: 'codex_lb_key',
  route: '$Naruto',
  service_tier: 'fast',
  source: 'codex_lb',
  confidence: 'high',
  conflict: false,
  warnings: [],
  signals: {
    openai_api_key_present: false,
    codex_lb_key_present: true,
    codex_lb_explicit: true,
    codex_app_auth_present: false,
    model_provider: 'codex-lb'
  }
}
const unsupported = await buildCodexAppProviderBadgeStatus(process.cwd(), { providerContext, officialCapability: false })
const supported = await buildCodexAppProviderBadgeStatus(process.cwd(), { providerContext, officialCapability: true })
const ok = unsupported.ok
  && supported.ok
  && unsupported.native_app_badge_supported === false
  && unsupported.private_app_mutation === false
  && unsupported.fallback_surfaces.includes('doctor --json')
  && supported.native_app_badge_status === 'available'
  && unsupported.badge_text === 'Provider: codex-lb · Fast'
emit({ schema: 'sks.codex-app-provider-badge-check.v1', ok, unsupported, supported, blockers: ok ? [] : ['codex_app_provider_badge_check_failed'] })

function emit(report: Record<string, unknown>) {
  console.log(JSON.stringify(report, null, 2))
  if (!report.ok) process.exitCode = 1
}

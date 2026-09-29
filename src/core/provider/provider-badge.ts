import type { ProviderContext } from './provider-context.js'

export function providerBadgeText(context: Pick<ProviderContext, 'provider' | 'service_tier' | 'signals'>) {
  const bridgeProvider = context.signals.desktop_bridge_provider
  const providerText = context.provider === 'openai'
    ? 'OpenAI API'
    : context.provider === 'desktop-bridge'
      ? `Desktop Bridge${bridgeProvider ? ` → ${bridgeProvider}` : ''}`
      : context.provider === 'codex-app'
        ? 'Codex App OAuth'
        : 'Unknown'
  const tierText = context.service_tier === 'fast'
    ? 'Fast'
    : context.service_tier === 'standard'
      ? 'Standard'
      : 'Check doctor'
  return `Provider: ${providerText} · ${tierText}`
}

export function providerPaneLabel(context: Pick<ProviderContext, 'provider' | 'service_tier' | 'signals'>) {
  const provider = context.provider === 'unknown'
    ? 'provider-unknown'
    : context.provider === 'desktop-bridge' && context.signals.desktop_bridge_provider
      ? `desktop-bridge/${context.signals.desktop_bridge_provider}`
      : context.provider
  const tier = context.service_tier === 'unknown' ? 'tier-unknown' : context.service_tier
  return `${tier} · ${provider}`
}


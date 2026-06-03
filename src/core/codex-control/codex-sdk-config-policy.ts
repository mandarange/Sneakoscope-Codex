import type { CodexTaskInput } from './codex-control-plane.js'

export function buildCodexSdkConfig(input: CodexTaskInput) {
  const config: Record<string, unknown> = {
    model: String(process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || 'gpt-5.5'),
    service_tier: 'fast',
    model_reasoning_effort: 'medium',
    mcp_servers: {},
    sks: {
      route: input.route,
      tier: input.tier || 'worker',
      mission_id: input.missionId,
      slot_id: input.slotId || '',
      generation_index: Number(input.generationIndex || 0)
    }
  }
  const codexLbApiKey = String(process.env.CODEX_LB_API_KEY || '').trim()
  const codexLbBaseUrl = normalizeCodexLbBaseUrl(process.env.CODEX_LB_BASE_URL)
  if (codexLbApiKey && codexLbBaseUrl) {
    config.model_provider = 'codex-lb'
    config.model_providers = {
      'codex-lb': {
        name: 'OpenAI',
        base_url: codexLbBaseUrl,
        wire_api: 'responses',
        env_key: 'CODEX_LB_API_KEY',
        supports_websockets: true,
        requires_openai_auth: false
      }
    }
  }
  return config
}

export function redactCodexSdkConfig(config: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(config, (_key, value) => {
    if (typeof value === 'string' && /(?:key|token|secret|password|credential|auth|cookie)/i.test(value)) return '<redacted>'
    return value
  }))
}

function normalizeCodexLbBaseUrl(value: unknown) {
  let host = String(value || '').trim()
  if (!host) return ''
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(host)) host = `https://${host}`
  host = host.replace(/\/+$/, '')
  return /\/backend-api\/codex$/i.test(host) ? host : `${host}/backend-api/codex`
}

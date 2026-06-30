import type { CodexTaskInput } from './codex-control-plane.js'

export interface CodexExecutionPolicy {
  sandbox: 'read-only' | 'workspace-write' | 'danger-full-access'
  approval: 'untrusted' | 'on-request' | 'never'
  network: 'disabled' | 'proxy-limited' | 'full'
  webSearch: 'disabled' | 'cached' | 'indexed' | 'live'
  gitRepoCheck: 'required' | 'allow-explicit-non-git'
  mutation: 'deny' | 'ledgered' | 'transactional'
}

export function buildCodexSdkConfig(input: CodexTaskInput) {
  const model = String(input.model || process.env.SKS_CODEX_MODEL || process.env.CODEX_MODEL || 'gpt-5.5')
  const config: Record<string, unknown> = {
    model,
    service_tier: 'fast',
    model_reasoning_effort: String(input.modelReasoningEffort || input.reasoningEffort || process.env.SKS_CODEX_REASONING || process.env.CODEX_MODEL_REASONING_EFFORT || 'medium'),
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

export function buildCodexExecutionPolicy(input: CodexTaskInput): CodexExecutionPolicy {
  const sandbox = String(input.requestedScopeContract?.sandbox || process.env.SKS_CODEX_SANDBOX || 'workspace-write') as CodexExecutionPolicy['sandbox']
  const approval = String(process.env.SKS_CODEX_APPROVAL || (String(input.tier || '') === 'verifier' ? 'never' : 'on-request')) as CodexExecutionPolicy['approval']
  const network = String(process.env.SKS_CODEX_NETWORK || 'disabled') as CodexExecutionPolicy['network']
  const webSearch = String(process.env.SKS_CODEX_WEB_SEARCH || 'cached') as CodexExecutionPolicy['webSearch']
  const gitRepoCheck = process.env.SKS_CODEX_ALLOW_NON_GIT === '1' ? 'allow-explicit-non-git' : 'required'
  const mutation = String(input.tier || '') === 'verifier' || sandbox === 'read-only' ? 'deny' : 'ledgered'
  return {
    sandbox,
    approval,
    network,
    webSearch,
    gitRepoCheck,
    mutation
  }
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

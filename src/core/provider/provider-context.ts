import path from 'node:path'
import { exists, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const PROVIDER_CONTEXT_SCHEMA = 'sks.provider-context.v1'

export type ProviderId = 'openai' | 'codex-lb' | 'codex-app' | 'unknown'
export type ProviderAuthMode = 'api_key' | 'chatgpt_oauth' | 'codex_lb_key' | 'unknown'
export type ProviderContextSource = 'env' | 'config' | 'codex_app' | 'codex_lb' | 'unknown'

export interface ProviderContext {
  schema: typeof PROVIDER_CONTEXT_SCHEMA
  generated_at: string
  provider: ProviderId
  auth_mode: ProviderAuthMode
  route: string
  service_tier: 'fast' | 'standard' | 'unknown'
  source: ProviderContextSource
  confidence: 'high' | 'medium' | 'low'
  conflict: boolean
  warnings: string[]
  signals: {
    openai_api_key_present: boolean
    codex_lb_key_present: boolean
    codex_lb_explicit: boolean
    codex_app_auth_present: boolean
    model_provider: string | null
  }
}

export async function resolveProviderContext(input: {
  root?: string
  route?: string | null
  serviceTier?: string | null
  modelProvider?: string | null
  env?: NodeJS.ProcessEnv
  codexHome?: string | null
} = {}): Promise<ProviderContext> {
  const env = input.env || process.env
  const root = path.resolve(input.root || process.cwd())
  const codexHome = path.resolve(String(input.codexHome || env.CODEX_HOME || path.join(env.HOME || '', '.codex')))
  const openaiKey = Boolean(String(env.OPENAI_API_KEY || '').trim())
  const lbKey = Boolean(String(env.CODEX_LB_API_KEY || '').trim())
  const envProvider = String(env.SKS_MODEL_PROVIDER || env.CODEX_MODEL_PROVIDER || env.OPENAI_MODEL_PROVIDER || '').trim()
  const modelProvider = String(input.modelProvider || envProvider || '').trim() || null
  const lbExplicit = modelProvider === 'codex-lb' || env.SKS_PROVIDER === 'codex-lb' || env.SKS_USE_CODEX_LB === '1'
  const auth = await readJson<any>(path.join(codexHome, 'auth.json'), null).catch(() => null)
  const appAuthPresent = Boolean(auth) || await exists(path.join(codexHome, 'auth.json'))
  const conflict = (lbKey && openaiKey && !lbExplicit && !modelProvider) || (modelProvider === 'codex-lb' && !lbKey && openaiKey)
  let provider: ProviderId = 'unknown'
  let authMode: ProviderAuthMode = 'unknown'
  let source: ProviderContextSource = 'unknown'
  let confidence: ProviderContext['confidence'] = 'low'
  if (lbExplicit && lbKey) {
    provider = 'codex-lb'
    authMode = 'codex_lb_key'
    source = 'codex_lb'
    confidence = 'high'
  } else if (modelProvider === 'codex-lb') {
    provider = 'codex-lb'
    authMode = lbKey ? 'codex_lb_key' : 'unknown'
    source = 'config'
    confidence = lbKey ? 'medium' : 'low'
  } else if (openaiKey) {
    provider = 'openai'
    authMode = 'api_key'
    source = 'env'
    confidence = conflict ? 'medium' : 'high'
  } else if (appAuthPresent) {
    provider = 'codex-app'
    authMode = 'chatgpt_oauth'
    source = 'codex_app'
    confidence = 'medium'
  }
  const warnings = [
    ...(conflict ? ['provider_conflict'] : []),
    ...(provider === 'codex-lb' && !lbKey ? ['codex_lb_selected_without_key'] : [])
  ]
  return {
    schema: PROVIDER_CONTEXT_SCHEMA,
    generated_at: nowIso(),
    provider,
    auth_mode: authMode,
    route: String(input.route || env.SKS_ROUTE || '$Agent'),
    service_tier: normalizeServiceTier(input.serviceTier || env.SKS_SERVICE_TIER),
    source,
    confidence,
    conflict,
    warnings,
    signals: {
      openai_api_key_present: openaiKey,
      codex_lb_key_present: lbKey,
      codex_lb_explicit: lbExplicit,
      codex_app_auth_present: appAuthPresent,
      model_provider: modelProvider
    }
  }
}

export async function writeProviderContextReport(root: string = process.cwd(), input: Parameters<typeof resolveProviderContext>[0] = {}) {
  const report = await resolveProviderContext({ ...input, root })
  const reportPath = path.join(path.resolve(root), '.sneakoscope', 'reports', 'provider-context.json')
  await writeJsonAtomic(reportPath, report)
  return { ...report, report_path: reportPath }
}

function normalizeServiceTier(value: unknown): ProviderContext['service_tier'] {
  const text = String(value || '').toLowerCase()
  if (text === 'fast' || text === 'priority') return 'fast'
  if (text === 'standard' || text === 'default') return 'standard'
  return 'unknown'
}

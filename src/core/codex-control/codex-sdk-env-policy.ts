import type { CodexTaskInput } from './codex-control-plane.js'
import path from 'node:path'

const SECRET_RE = /(?:key|token|secret|password|credential|auth|cookie)/i
const BASE_ALLOWED_ENV = new Set([
  'PATH',
  'TMPDIR',
  'TEMP',
  'TMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'SHELL',
  'USER',
  'LOGNAME',
  'CI',
  'NODE_ENV',
  'SKS_CODEX_BIN',
  'CODEX_BIN'
])

export function buildCodexSdkEnv(input: CodexTaskInput): { env: Record<string, string>; proof: Record<string, unknown> } {
  const env: Record<string, string> = {}
  env.SKS_CODEX_CONTROL_PLANE = '1'
  env.SKS_PARENT_MISSION_ID = input.missionId
  env.SKS_ROUTE = input.route
  if (input.workItemId) env.SKS_WORK_ITEM_ID = input.workItemId
  if (input.slotId) env.SKS_AGENT_SLOT_ID = input.slotId
  if (input.sessionId) env.SKS_AGENT_SESSION_ID = input.sessionId
  if (input.generationIndex !== undefined) env.SKS_AGENT_GENERATION_INDEX = String(input.generationIndex)
  env.SKS_SERVICE_TIER = String(input.serviceTier || 'fast')
  const isolatedRoot = path.resolve(input.mutationLedgerRoot, 'codex-sdk-home')
  env.HOME = path.join(isolatedRoot, 'home')
  env.CODEX_HOME = path.join(isolatedRoot, 'codex')
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined || key in env) continue
    if (BASE_ALLOWED_ENV.has(key) || key.startsWith('LC_')) env[key] = String(value)
  }
  const codexLbApiKey = String(process.env.CODEX_LB_API_KEY || '').trim()
  const codexLbBaseUrl = String(process.env.CODEX_LB_BASE_URL || '').trim()
  const codexLbEnvInjected = process.env.SKS_CODEX_LB_AUTOBYPASS !== '1' && Boolean(codexLbApiKey && codexLbBaseUrl)
  if (codexLbEnvInjected) {
    env.CODEX_LB_API_KEY = codexLbApiKey
    env.CODEX_LB_BASE_URL = codexLbBaseUrl
  }
  env.SKS_CODEX_CONTROL_PLANE_CONFIG_ISOLATED = '1'
  const inheritedKeys = Object.keys(env).filter((key) => !key.startsWith('SKS_') && key !== 'HOME' && key !== 'CODEX_HOME').sort()
  const blockedHostKeys = Object.keys(process.env).filter((key) => !(key in env)).sort()
  return {
    env,
    proof: {
      injected_keys: Object.keys(env).filter((key) => key.startsWith('SKS_')).sort(),
      inherited_allowed_keys: inheritedKeys,
      inherited_key_count: inheritedKeys.length,
      blocked_host_env_key_count: blockedHostKeys.length,
      blocked_sensitive_host_env_key_count: blockedHostKeys.filter((key) => SECRET_RE.test(key)).length,
      redacted_sensitive_keys: Object.keys(env).filter((key) => SECRET_RE.test(key)).sort(),
      codex_lb_env_injected: codexLbEnvInjected,
      codex_lb_env_source: codexLbEnvInjected ? 'process.env' : null,
      codex_lb_api_key_redacted: codexLbEnvInjected,
      codex_home_isolated: true,
      codex_home: env.CODEX_HOME,
      home: env.HOME
    }
  }
}

export function redactCodexSdkEnv(env: Record<string, string>) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, SECRET_RE.test(key) ? '<redacted>' : value]))
}

import type { CodexTaskInput } from './codex-control-plane.js'

const SECRET_RE = /(?:key|token|secret|password|credential|auth|cookie)/i

export function buildCodexSdkEnv(input: CodexTaskInput): { env: Record<string, string>; proof: Record<string, unknown> } {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = String(value)
  }
  env.SKS_CODEX_CONTROL_PLANE = '1'
  env.SKS_PARENT_MISSION_ID = input.missionId
  env.SKS_ROUTE = input.route
  if (input.workItemId) env.SKS_WORK_ITEM_ID = input.workItemId
  if (input.slotId) env.SKS_AGENT_SLOT_ID = input.slotId
  if (input.sessionId) env.SKS_AGENT_SESSION_ID = input.sessionId
  if (input.generationIndex !== undefined) env.SKS_AGENT_GENERATION_INDEX = String(input.generationIndex)
  env.SKS_SERVICE_TIER = 'fast'
  return {
    env,
    proof: {
      injected_keys: Object.keys(env).filter((key) => key.startsWith('SKS_')).sort(),
      inherited_key_count: Object.keys(process.env).length,
      redacted_sensitive_keys: Object.keys(env).filter((key) => SECRET_RE.test(key)).sort()
    }
  }
}

export function redactCodexSdkEnv(env: Record<string, string>) {
  return Object.fromEntries(Object.entries(env).map(([key, value]) => [key, SECRET_RE.test(key) ? '<redacted>' : value]))
}

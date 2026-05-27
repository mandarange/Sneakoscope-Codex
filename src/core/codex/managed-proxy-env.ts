export const MANAGED_PROXY_ENV_SCHEMA = 'sks.codex-managed-proxy-env.v1'

export const MANAGED_PROXY_ENV_KEYS = [
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'CODEX_PROXY',
  'CODEX_HTTP_PROXY',
  'CODEX_HTTPS_PROXY',
] as const

export interface ManagedProxyEnvReport {
  schema: typeof MANAGED_PROXY_ENV_SCHEMA
  ok: boolean
  keys_present: string[]
  redacted: Record<string, string>
  child_env_keys: string[]
  warnings: string[]
}

export function managedProxyEnvForChild(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of MANAGED_PROXY_ENV_KEYS) {
    const value = env[key]
    if (typeof value === 'string' && value.length > 0) out[key] = value
  }
  return out
}

export function detectManagedProxyEnv(env: NodeJS.ProcessEnv = process.env): ManagedProxyEnvReport {
  const childEnv = managedProxyEnvForChild(env)
  const redacted = Object.fromEntries(Object.entries(childEnv).map(([key, value]) => [key, redactProxyValue(value)]))
  const keysPresent = Object.keys(childEnv).sort()
  return {
    schema: MANAGED_PROXY_ENV_SCHEMA,
    ok: true,
    keys_present: keysPresent,
    redacted,
    child_env_keys: keysPresent,
    warnings: keysPresent.length === 0 ? ['managed_proxy_env_not_present'] : []
  }
}

export function redactProxyValue(value: string): string {
  try {
    const parsed = new URL(value)
    if (parsed.username) parsed.username = 'redacted'
    if (parsed.password) parsed.password = 'redacted'
    return parsed.toString()
  } catch {
    return value.replace(/\/\/([^:@/\s]+):([^@/\s]+)@/g, '//redacted:redacted@')
  }
}

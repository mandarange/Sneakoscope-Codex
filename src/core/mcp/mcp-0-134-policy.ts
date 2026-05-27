import { nowIso } from '../fsx.js'

export const MCP_0_134_POLICY_SCHEMA = 'sks.mcp-0.134-policy.v1'

export interface Mcp0134Server {
  name: string
  environment_keys: string[]
  transport: string | null
  oauth_configured: boolean
}

export interface Mcp0134ToolClassification {
  name: string
  read_only_hint: boolean
  concurrency: 'candidate_parallel_readonly' | 'serial_required'
  advisory_only: boolean
  warnings: string[]
}

const DESTRUCTIVE_TOOL_RE = /(?:^|[^A-Za-z0-9])(write|delete|remove|rm|mutate|update|insert|create|drop|truncate|reset|publish|deploy|apply|patch|commit|push)(?:$|[^A-Za-z0-9])/i
const DESTRUCTIVE_WORDS = [
  'write',
  'delete',
  'remove',
  'rm',
  'mutate',
  'update',
  'insert',
  'create',
  'drop',
  'truncate',
  'reset',
  'publish',
  'deploy',
  'apply',
  'patch',
  'commit',
  'push'
]

export function classifyMcpToolForConcurrency(tool: any): Mcp0134ToolClassification {
  const annotations = tool?.annotations || tool?.inputSchema?.annotations || tool?.schema?.annotations || {}
  const readOnlyHint = annotations.readOnlyHint === true
  const name = String(tool?.name || tool?.id || '')
  const schemaText = safeJson(tool?.inputSchema || tool?.schema || {})
  const destructive =
    hasDestructiveSignal(name) ||
    hasDestructiveSignal(schemaText) ||
    annotations.destructiveHint === true
  return {
    name,
    read_only_hint: readOnlyHint,
    concurrency: readOnlyHint && !destructive ? 'candidate_parallel_readonly' : 'serial_required',
    advisory_only: true,
    warnings: [
      ...(readOnlyHint ? ['readOnlyHint_is_advisory_not_authoritative'] : ['readOnlyHint_missing']),
      ...(destructive ? ['destructive_name_or_schema_blocks_parallel_mcp'] : [])
    ]
  }
}

export function compactMcpToolSchema(schema: any, maxBytes = 8192) {
  const text = safeJson(schema)
  const hasDollarDefs = Boolean(schema?.$defs)
  const hasDefinitions = Boolean(schema?.definitions)
  const refs = collectRefs(schema)
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return {
      schema,
      compacted: false,
      original_bytes: Buffer.byteLength(text, 'utf8'),
      preserved_ref_defs: refs.length > 0 || hasDollarDefs || hasDefinitions,
      refs
    }
  }
  const preservedDefs: Record<string, any> = {}
  if (hasDollarDefs) preservedDefs.$defs = schema.$defs
  if (hasDefinitions) preservedDefs.definitions = schema.definitions
  return {
    schema: {
      type: schema?.type || 'object',
      description: String(schema?.description || '').slice(0, 512),
      properties: Object.fromEntries(Object.entries(schema?.properties || {}).slice(0, 50)),
      ...preservedDefs,
      ...(refs.length ? { refs } : {})
    },
    compacted: true,
    original_bytes: Buffer.byteLength(text, 'utf8'),
    preserved_ref_defs: refs.length > 0 || hasDollarDefs || hasDefinitions,
    refs
  }
}

export function detectMcp0134PolicyFromConfig(sources: Array<{ path: string; text: string; source?: string }> = []) {
  const servers = sources.flatMap((source) => parseServers(source.text))
  const streamableWithoutOAuth = servers.filter((server) => isStreamableHttp(server.transport) && !server.oauth_configured)
  return {
    schema: MCP_0_134_POLICY_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    servers,
    per_server_environment_supported: servers.some((server) => server.environment_keys.length > 0),
    streamable_http_oauth_supported: servers.some((server) => server.oauth_configured && isStreamableHttp(server.transport)),
    streamable_http_servers_detected: servers.filter((server) => isStreamableHttp(server.transport)).map((server) => server.name),
    warnings: [
      ...(servers.length ? [] : ['mcp_servers_not_configured']),
      ...streamableWithoutOAuth.map((server) => `streamable_http_oauth_not_configured:${server.name}`)
    ]
  }
}

function parseServers(text: string): Mcp0134Server[] {
  const trimmed = String(text || '').trim()
  if (!trimmed) return []
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed)
      const servers = parsed.mcp_servers || parsed.mcpServers || {}
      return Object.entries<any>(servers).map(([name, value]) => ({
        name,
        environment_keys: Object.keys(value?.env || value?.environment || {}),
        transport: value?.transport || value?.type || null,
        oauth_configured: isConfiguredObject(value?.oauth) || isConfiguredObject(value?.auth?.oauth)
      }))
    } catch {
      return []
    }
  }
  const servers = new Map<string, Mcp0134Server>()
  for (const section of tomlSections(text)) {
    if (!section.parts.length) continue
    const name = unquote(section.parts[0] || '')
    if (!name) continue
    const server = ensureServer(servers, name)
    const subtable = section.parts.slice(1).map((part) => unquote(part)).join('.')
    if (subtable === 'env' || subtable === 'environment') {
      server.environment_keys.push(...assignmentKeys(section.body))
      continue
    }
    if (subtable === 'oauth' || subtable === 'auth.oauth' || subtable === 'authorization') {
      server.oauth_configured = section.body.trim().length > 0 || server.oauth_configured
      continue
    }
    server.environment_keys.push(...[...section.body.matchAll(/^\s*(?:env|environment)\.([A-Za-z0-9_]+)\s*=/gm)].map((entry) => String(entry[1] || '')))
    const transport = section.body.match(/^\s*(?:transport|type)\s*=\s*["']?([^"'\n]+)["']?/m)?.[1]?.trim()
    if (transport) server.transport = transport
    if (/^\s*(?:oauth|authorization)\s*=\s*(?:true|["'][^"']+["']|\{)/im.test(section.body)) server.oauth_configured = true
  }
  return [...servers.values()].map((server) => ({
    ...server,
    environment_keys: [...new Set(server.environment_keys)].sort()
  }))
}

function hasDestructiveSignal(value: string): boolean {
  if (DESTRUCTIVE_TOOL_RE.test(` ${value} `)) return true
  const normalized = String(value || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[.:/\\-]+/g, '_')
    .toLowerCase()
  return DESTRUCTIVE_WORDS.some((word) => new RegExp(`(?:^|[^a-z0-9])${word}(?:$|[^a-z0-9])`).test(normalized))
}

function isStreamableHttp(transport: string | null): boolean {
  return /streamable.*http|http.*streamable/i.test(String(transport || ''))
}

function isConfiguredObject(value: any): boolean {
  if (value === true || typeof value === 'string') return true
  return Boolean(value && typeof value === 'object' && Object.keys(value).length > 0)
}

function ensureServer(servers: Map<string, Mcp0134Server>, name: string): Mcp0134Server {
  let server = servers.get(name)
  if (!server) {
    server = { name, environment_keys: [], transport: null, oauth_configured: false }
    servers.set(name, server)
  }
  return server
}

function tomlSections(text: string): Array<{ parts: string[]; body: string }> {
  const sections: Array<{ parts: string[]; body: string }> = []
  const tableRe = /^\s*\[(?:mcp_servers|mcpServers)\.([^\]]+)\]\s*$/gm
  let match: RegExpExecArray | null
  while ((match = tableRe.exec(text)) !== null) {
    const start = match.index + match[0].length
    const next = text.slice(start).search(/^\s*\[/m)
    const body = next >= 0 ? text.slice(start, start + next) : text.slice(start)
    sections.push({ parts: splitTomlPath(match[1] || ''), body })
  }
  return sections
}

function splitTomlPath(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: string | null = null
  for (const char of String(value || '')) {
    if ((char === '"' || char === "'") && !quote) {
      quote = char
      continue
    }
    if (char === quote) {
      quote = null
      continue
    }
    if (char === '.' && !quote) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function assignmentKeys(body: string): string[] {
  return [...String(body || '').matchAll(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
    .map((entry) => String(entry[1] || ''))
    .filter((key) => !['transport', 'type', 'oauth', 'authorization'].includes(key))
}

function collectRefs(value: any, refs = new Set<string>()): string[] {
  if (!value || typeof value !== 'object') return [...refs]
  if (typeof value.$ref === 'string') refs.add(value.$ref)
  for (const child of Object.values(value)) collectRefs(child, refs)
  return [...refs].sort()
}

function safeJson(value: any): string {
  try {
    return JSON.stringify(value || {})
  } catch {
    return '{}'
  }
}

function unquote(value: string): string {
  return String(value || '').trim().replace(/^["']|["']$/g, '')
}

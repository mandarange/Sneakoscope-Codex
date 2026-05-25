import os from 'node:os'
import path from 'node:path'
import { exists, nowIso, readText } from '../fsx.js'

export const XAI_MCP_DETECTION_SCHEMA = 'sks.xai-mcp-detection.v1'

export type XaiMcpStatus = 'missing' | 'search_capable' | 'configured_but_unverified' | 'configured_no_search' | 'error'

export interface XaiMcpConfigSource {
  path: string
  source: 'user' | 'project' | 'provided'
  text: string
}

export interface XaiMcpServerDetection {
  name: string
  source: string
  configured: boolean
  search_capable: boolean
  configured_but_unverified: boolean
  tools: string[]
  raw_name: string
}

export interface XaiMcpDetection {
  schema: typeof XAI_MCP_DETECTION_SCHEMA
  generated_at: string
  ok: boolean
  status: XaiMcpStatus
  configured: boolean
  search_capable: boolean
  configured_but_unverified: boolean
  servers: XaiMcpServerDetection[]
  config_paths_checked: string[]
  config_paths_found: string[]
  blockers: string[]
  warnings: string[]
}

export interface DetectXaiMcpOptions {
  root?: string
  home?: string
  configSources?: XaiMcpConfigSource[]
  toolLists?: Record<string, string[]>
}

const XAI_SERVER_RE = /(?:^|[-_\s.])(xai|x-ai|x_ai|grok|x\.ai)(?:$|[-_\s.])/i
const SEARCH_TOOL_RE = /(?:search|query|web|retrieve|retrieval|news|grok)/i

export function isXaiServerName(name: string): boolean {
  return XAI_SERVER_RE.test(normalizeName(name))
}

export function isSearchToolName(name: string): boolean {
  return SEARCH_TOOL_RE.test(normalizeName(name))
}

export async function detectXaiMcp(opts: DetectXaiMcpOptions = {}): Promise<XaiMcpDetection> {
  const root = path.resolve(opts.root || process.cwd())
  const home = opts.home || os.homedir()
  const configPaths = [
    { path: path.join(home, '.codex', 'config.toml'), source: 'user' as const },
    { path: path.join(root, '.codex', 'config.toml'), source: 'project' as const },
    { path: path.join(root, '.codex', 'config.json'), source: 'project' as const }
  ]
  const provided = opts.configSources || []
  const discovered: XaiMcpConfigSource[] = [...provided]
  for (const entry of configPaths) {
    if (provided.some((source) => path.resolve(source.path) === path.resolve(entry.path))) continue
    if (await exists(entry.path)) {
      discovered.push({ path: entry.path, source: entry.source, text: String(await readText(entry.path, '')) })
    }
  }
  return detectXaiMcpFromConfig(discovered, {
    checked: configPaths.map((entry) => entry.path),
    toolLists: opts.toolLists || {}
  })
}

export function detectXaiMcpFromConfig(
  sources: XaiMcpConfigSource[] = [],
  opts: { checked?: string[]; toolLists?: Record<string, string[]> } = {}
): XaiMcpDetection {
  try {
    const servers = sources.flatMap((source) => detectServersInSource(source, opts.toolLists || {}))
    const configured = servers.length > 0
    const searchCapable = servers.some((server) => server.search_capable)
    const configuredButUnverified = configured && !searchCapable && servers.some((server) => server.configured_but_unverified)
    const status: XaiMcpStatus = !configured
      ? 'missing'
      : searchCapable
        ? 'search_capable'
        : configuredButUnverified
          ? 'configured_but_unverified'
          : 'configured_no_search'
    return {
      schema: XAI_MCP_DETECTION_SCHEMA,
      generated_at: nowIso(),
      ok: true,
      status,
      configured,
      search_capable: searchCapable,
      configured_but_unverified: configuredButUnverified,
      servers,
      config_paths_checked: [...new Set([...(opts.checked || []), ...sources.map((source) => source.path)])],
      config_paths_found: sources.map((source) => source.path),
      blockers: [],
      warnings: configuredButUnverified ? ['xai_mcp_configured_but_tool_list_unverified'] : []
    }
  } catch (err: unknown) {
    return {
      schema: XAI_MCP_DETECTION_SCHEMA,
      generated_at: nowIso(),
      ok: false,
      status: 'error',
      configured: false,
      search_capable: false,
      configured_but_unverified: false,
      servers: [],
      config_paths_checked: opts.checked || [],
      config_paths_found: sources.map((source) => source.path),
      blockers: [`xai_mcp_detection_error:${err instanceof Error ? err.message : String(err)}`],
      warnings: []
    }
  }
}

function detectServersInSource(source: XaiMcpConfigSource, toolLists: Record<string, string[]>): XaiMcpServerDetection[] {
  const jsonServers = parseJsonServers(source)
  const tomlServers = jsonServers.length ? [] : parseTomlServerNames(source.text)
  const names = [...jsonServers, ...tomlServers].filter((server) => isXaiServerName(server.name))
  return names.map((server) => {
    const configuredTools = [...server.tools, ...(toolLists[server.name] || []), ...(toolLists[normalizeName(server.name)] || [])]
    const uniqueTools = [...new Set(configuredTools.map(String).filter(Boolean))]
    const searchCapable = uniqueTools.some(isSearchToolName)
    return {
      name: normalizeName(server.name),
      source: `${source.source}:${source.path}`,
      configured: true,
      search_capable: searchCapable,
      configured_but_unverified: !searchCapable && uniqueTools.length === 0,
      tools: uniqueTools,
      raw_name: server.name
    }
  })
}

function parseJsonServers(source: XaiMcpConfigSource): Array<{ name: string; tools: string[] }> {
  const text = source.text.trim()
  if (!text.startsWith('{')) return []
  try {
    const parsed = JSON.parse(text)
    const servers = parsed?.mcp_servers || parsed?.mcpServers || {}
    return Object.entries<any>(servers).map(([name, value]) => ({
      name,
      tools: extractToolNames(value)
    }))
  } catch {
    return []
  }
}

function parseTomlServerNames(text: string): Array<{ name: string; tools: string[] }> {
  const rows: Array<{ name: string; tools: string[] }> = []
  const tableRe = /^\s*\[(?:mcp_servers|mcpServers)\.([^\]]+)\]\s*$/gm
  let match: RegExpExecArray | null
  while ((match = tableRe.exec(text)) !== null) {
    const name = unquote(match[1] || '')
    const bodyStart = match.index + match[0].length
    const nextTable = text.slice(bodyStart).search(/^\s*\[/m)
    const body = nextTable >= 0 ? text.slice(bodyStart, bodyStart + nextTable) : text.slice(bodyStart)
    rows.push({ name, tools: extractToolNamesFromText(body) })
  }
  return rows
}

function extractToolNames(value: any): string[] {
  if (!value || typeof value !== 'object') return []
  const possible = [
    value.tools,
    value.tool_names,
    value.capabilities,
    value.search_tools
  ]
  return possible.flatMap((entry) => Array.isArray(entry) ? entry.map(String) : [])
}

function extractToolNamesFromText(text: string): string[] {
  const tools: string[] = []
  const arrayRe = /(?:tools|tool_names|capabilities|search_tools)\s*=\s*\[([^\]]*)\]/g
  let match: RegExpExecArray | null
  while ((match = arrayRe.exec(text)) !== null) {
    tools.push(...String(match[1] || '').split(',').map((part) => unquote(part.trim())).filter(Boolean))
  }
  const keyRe = /^\s*(search|query|web|retrieve|news|grok)\s*=/gmi
  while ((match = keyRe.exec(text)) !== null) tools.push(match[1] || '')
  return tools
}

function normalizeName(name: string): string {
  return String(name || '').trim().replace(/^["']|["']$/g, '').toLowerCase()
}

function unquote(value: string): string {
  return String(value || '').trim().replace(/^["']|["']$/g, '')
}

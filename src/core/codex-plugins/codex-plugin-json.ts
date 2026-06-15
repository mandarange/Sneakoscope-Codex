import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { detectCodex0138Capability } from '../codex-control/codex-0138-capability.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'

export interface CodexPluginInventory {
  schema: 'sks.codex-plugin-inventory.v1'
  generated_at: string
  codex_0138_capability: any
  fetch_concurrency: number
  detail_fetch_count: number
  detail_fetch_failed_count: number
  duration_ms: number
  plugins: Array<{
    id: string
    name: string
    source: 'marketplace' | 'local' | 'remote' | 'unknown'
    installed: boolean
    enabled: boolean
    default_prompts: string[]
    remote_mcp_servers: Array<{
      name: string
      url: string | null
      auth_type: string | null
    }>
    unavailable_app_templates: string[]
    raw: any
  }>
  marketplace_available: boolean
  blockers: string[]
}

export async function runCodexPluginListJson(): Promise<any> {
  if (process.env.SKS_CODEX_PLUGIN_JSON_FAKE === '1') return fakePluginList()
  const bin = await findCodexBinary()
  if (!bin) return { plugins: [], blockers: ['codex_cli_missing'] }
  return runCodexJson(bin, ['plugin', 'list', '--json'])
}

export async function runCodexPluginDetailJson(pluginId: string): Promise<any> {
  if (process.env.SKS_CODEX_PLUGIN_JSON_FAKE === '1') return fakePluginDetail(pluginId)
  const bin = await findCodexBinary()
  if (!bin) return { blockers: ['codex_cli_missing'] }
  return runCodexJson(bin, ['plugin', 'detail', pluginId, '--json'])
}

export async function buildCodexPluginInventory(): Promise<CodexPluginInventory> {
  const started = Date.now()
  const capability = await detectCodex0138Capability()
  const listJson = await runCodexPluginListJson()
  const summaries = normalizePluginList(listJson)
  const concurrency = Math.max(1, Number(process.env.SKS_CODEX_PLUGIN_DETAIL_CONCURRENCY || 6) || 6)
  let failed = 0
  const plugins = await mapWithConcurrency(summaries, concurrency, async (summary) => {
    const detail = await runCodexPluginDetailJson(summary.id || summary.name).catch((err: any) => ({ error: err?.message || String(err) }))
    if (detail?.error || normalizeList(detail?.blockers).length > 0) failed += 1
    return normalizePlugin(summary, detail)
  })
  const blockers = [
    ...(capability.supports_plugin_json ? [] : ['codex_0_138_plugin_json_unavailable']),
    ...normalizeList(listJson?.blockers),
    ...(process.env.SKS_CODEX_PLUGIN_JSON_FAKE_NO_MCP === '1' ? ['fixture_mcp_candidates_disabled'] : [])
  ]
  return {
    schema: 'sks.codex-plugin-inventory.v1',
    generated_at: nowIso(),
    codex_0138_capability: capability,
    fetch_concurrency: concurrency,
    detail_fetch_count: summaries.length,
    detail_fetch_failed_count: failed,
    duration_ms: Date.now() - started,
    plugins,
    marketplace_available: plugins.some((plugin) => plugin.source === 'marketplace' || plugin.source === 'remote') || Boolean(listJson?.marketplace_available || listJson?.marketplaceAvailable),
    blockers
  }
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const limit = Math.max(1, Math.floor(concurrency || 1))
  const results = new Array<R>(items.length)
  let next = 0
  async function worker() {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await fn(items[index] as T)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length || 1) }, () => worker()))
  return results
}

export async function writeCodexPluginInventoryArtifacts(root: string, inventory = null as CodexPluginInventory | null) {
  const report = inventory || await buildCodexPluginInventory()
  const artifact = path.join(root, '.sneakoscope', 'codex-plugin-inventory.json')
  await writeJsonAtomic(artifact, report)
  return { report, artifact }
}

export function pluginAppTemplatePolicy(inventory: CodexPluginInventory) {
  const unavailable = inventory.plugins.flatMap((plugin) => plugin.unavailable_app_templates.map((template) => ({
    plugin: plugin.id,
    template
  })))
  return {
    schema: 'sks.codex-plugin-app-template-policy.v1',
    ok: true,
    unavailable_app_templates: unavailable,
    qa_loop_app_handoff_recommended: unavailable.length > 0,
    doctor_warnings: unavailable.map((row) => `plugin_app_template_unavailable:${row.plugin}`)
  }
}

async function runCodexJson(bin: string, args: string[]) {
  const result = await runProcess(bin, args, { timeoutMs: 20_000, maxOutputBytes: 256 * 1024 }).catch((err: any) => ({
    code: 1,
    stdout: '',
    stderr: err?.message || String(err)
  }))
  const text = `${result.stdout || ''}${result.stderr || ''}`.trim()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { raw_text: text, blockers: [`codex_plugin_json_parse_failed:${args.join(' ')}`] }
  }
}

function normalizePluginList(value: any): any[] {
  if (Array.isArray(value)) return value
  for (const key of ['plugins', 'installed_plugins', 'installedPlugins', 'items']) {
    if (Array.isArray(value?.[key])) return value[key]
  }
  return []
}

function normalizePlugin(summary: any, detail: any) {
  const raw = { summary, detail }
  const id = String(detail?.id || summary?.id || summary?.plugin_id || summary?.name || 'unknown')
  const name = String(detail?.name || summary?.name || id)
  const sourceText = String(detail?.source || detail?.marketplaceSource || summary?.source || summary?.marketplaceSource || '').toLowerCase()
  const source: 'marketplace' | 'local' | 'remote' | 'unknown' = sourceText.includes('marketplace') ? 'marketplace'
    : sourceText.includes('remote') ? 'remote'
      : sourceText.includes('local') ? 'local'
        : 'unknown'
  return {
    id,
    name,
    source,
    installed: boolish(detail?.installed ?? summary?.installed, true),
    enabled: boolish(detail?.enabled ?? summary?.enabled, true),
    default_prompts: normalizeList(detail?.default_prompts || detail?.defaultPrompts || detail?.prompts),
    remote_mcp_servers: normalizeMcpServers(detail?.remote_mcp_servers || detail?.remoteMcpServers || detail?.mcp_servers || detail?.mcpServers),
    unavailable_app_templates: normalizeList(detail?.unavailable_app_templates || detail?.unavailableAppTemplates || detail?.app_templates_unavailable),
    raw
  }
}

function normalizeMcpServers(value: any): Array<{ name: string; url: string | null; auth_type: string | null }> {
  const rows = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([name, row]: any) => ({ name, ...(row || {}) })) : []
  return rows.map((row: any, index) => ({
    name: String(row?.name || row?.id || `remote-mcp-${index + 1}`),
    url: stringOrNull(row?.url || row?.endpoint),
    auth_type: stringOrNull(row?.auth_type || row?.authType || row?.auth)
  }))
}

function normalizeList(value: any): string[] {
  return Array.isArray(value) ? value.filter(Boolean).map(String) : value ? [String(value)] : []
}

function stringOrNull(value: any): string | null {
  const text = String(value || '').trim()
  return text ? text : null
}

function boolish(value: any, fallback = false) {
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  return fallback
}

function fakePluginList() {
  const count = Math.max(1, Number(process.env.SKS_CODEX_PLUGIN_JSON_FAKE_COUNT || 1) || 1)
  return {
    marketplace_available: true,
    plugins: Array.from({ length: count }, (_, index) => ({
      id: 'fixture-plugin',
      name: index === 0 ? 'Fixture Plugin' : `Fixture Plugin ${index + 1}`,
      ...(index === 0 ? {} : { id: `fixture-plugin-${index + 1}` }),
      source: 'marketplace',
      installed: true,
      enabled: true
    }))
  }
}

function fakePluginDetail(pluginId: string) {
  return {
    id: pluginId,
    name: pluginId,
    source: 'marketplace',
    installed: true,
    enabled: true,
    default_prompts: ['Use the fixture plugin safely.'],
    remote_mcp_servers: process.env.SKS_CODEX_PLUGIN_JSON_FAKE_NO_MCP === '1'
      ? []
      : [{ name: 'fixture-db-docs', url: 'https://mcp.example.test', auth_type: 'oauth' }],
    unavailable_app_templates: ['fixture-desktop-template']
  }
}

import path from 'node:path'
import { findCodexBinary } from '../codex-adapter.js'
import { detectCodexCurrentAppCapability } from '../codex-control/codex-current-app-capability.js'
import { nowIso, runProcess, writeJsonAtomic } from '../fsx.js'
import { redactSecrets, redactString } from '../secret-redaction.js'

export interface CodexPluginInventory {
  schema: 'sks.codex-plugin-inventory.v1'
  generated_at: string
  codex_current_app_capability: any
  catalog_complete: boolean
  installed_count: number
  available_count: number
  duration_ms: number
  plugins: Array<{
    id: string
    name: string
    source: 'marketplace' | 'local' | 'remote' | 'unknown'
    marketplace?: string | null
    version?: string | null
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

export async function runCodexPluginListJson(
  codexBin?: string | null,
  runJson: (bin: string, args: string[]) => Promise<any> = runCodexJson
): Promise<any> {
  if (process.env.SKS_CODEX_PLUGIN_JSON_FAKE === '1') return fakePluginList()
  const bin = codexBin === undefined ? await findCodexBinary() : codexBin
  if (!bin) return { plugins: [], blockers: ['codex_cli_missing'] }
  return runJson(bin, ['plugin', 'list', '--available', '--json'])
}

export async function buildCodexPluginInventory(input: {
  codexBin?: string | null
  listJson?: any
} = {}): Promise<CodexPluginInventory> {
  const started = Date.now()
  const capability = await detectCodexCurrentAppCapability()
  const codexBin = input.codexBin === undefined ? await findCodexBinary() : input.codexBin
  const listJson = input.listJson === undefined ? await runCodexPluginListJson(codexBin) : input.listJson
  const plugins = normalizePluginList(listJson).map(normalizePlugin)
  const installedCount = plugins.filter((plugin) => plugin.installed).length
  const availableCount = plugins.length - installedCount
  const catalogComplete = Array.isArray(listJson?.available) && normalizeList(listJson?.blockers).length === 0
  const blockers = [
    ...normalizeList(listJson?.blockers),
    ...(process.env.SKS_CODEX_PLUGIN_JSON_FAKE_NO_MCP === '1' ? ['fixture_mcp_candidates_disabled'] : [])
  ]
  return redactSecrets({
    schema: 'sks.codex-plugin-inventory.v1',
    generated_at: nowIso(),
    codex_current_app_capability: capability,
    catalog_complete: catalogComplete,
    installed_count: installedCount,
    available_count: availableCount,
    duration_ms: Date.now() - started,
    plugins,
    marketplace_available: plugins.some((plugin) => plugin.source === 'marketplace' || plugin.source === 'remote' || plugin.marketplace) || Boolean(listJson?.marketplace_available || listJson?.marketplaceAvailable),
    blockers
  }) as CodexPluginInventory
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
    return { raw_text: redactString(text), blockers: [`codex_plugin_json_parse_failed:${args.join(' ')}`] }
  }
}

export function normalizePluginList(value: any): any[] {
  if (Array.isArray(value)) return value
  const rows: any[] = []
  const append = (items: any, installed: boolean | null = null) => {
    if (!Array.isArray(items)) return
    for (const item of items) rows.push(installed === null ? item : { ...item, installed: item?.installed ?? installed })
  }
  append(value?.installed, true)
  append(value?.available, false)
  for (const key of ['plugins', 'installed_plugins', 'installedPlugins', 'items']) append(value?.[key])
  const deduped = new Map<string, any>()
  for (const row of rows) {
    const selector = pluginSelector(row)
    const current = deduped.get(selector)
    if (!current || (row?.installed === true && current?.installed !== true)) deduped.set(selector, row)
  }
  return [...deduped.values()]
}

function normalizePlugin(summary: any) {
  const raw = { summary }
  const id = String(summary?.id || summary?.pluginId || summary?.plugin_id || pluginSelector(summary) || summary?.name || 'unknown')
  const name = String(summary?.name || id)
  const marketplace = stringOrNull(summary?.marketplaceName || summary?.marketplace)
  const sourceText = sourceValue(summary?.source || summary?.marketplaceSource).toLowerCase()
  const source: 'marketplace' | 'local' | 'remote' | 'unknown' = sourceText.includes('marketplace') ? 'marketplace'
    : sourceText.includes('remote') ? 'remote'
      : sourceText.includes('local') ? 'local'
        : 'unknown'
  const installed = boolish(summary?.installed, false)
  return {
    id,
    name,
    source,
    marketplace,
    version: stringOrNull(summary?.version),
    installed,
    enabled: boolish(summary?.enabled, installed),
    default_prompts: normalizeList(summary?.default_prompts || summary?.defaultPrompts || summary?.prompts),
    remote_mcp_servers: normalizeMcpServers(summary?.remote_mcp_servers || summary?.remoteMcpServers || summary?.mcp_servers || summary?.mcpServers),
    unavailable_app_templates: normalizeList(summary?.unavailable_app_templates || summary?.unavailableAppTemplates || summary?.app_templates_unavailable),
    raw
  }
}

function pluginSelector(value: any): string {
  const explicit = String(value?.pluginId || value?.plugin_id || value?.id || '').trim()
  if (explicit) return explicit
  const name = String(value?.name || '').trim()
  const marketplace = String(value?.marketplaceName || value?.marketplace || '').trim()
  return name && marketplace ? `${name}@${marketplace}` : name
}

function sourceValue(value: any): string {
  if (value && typeof value === 'object') {
    return String(value.source || value.sourceType || value.type || value.path || '')
  }
  return String(value || '')
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
      enabled: true,
      default_prompts: ['Use the fixture plugin safely.'],
      remote_mcp_servers: process.env.SKS_CODEX_PLUGIN_JSON_FAKE_NO_MCP === '1'
        ? []
        : [{ name: 'fixture-db-docs', url: 'https://mcp.example.test', auth_type: 'oauth' }],
      unavailable_app_templates: ['fixture-desktop-template']
    }))
  }
}

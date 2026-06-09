import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'
import type { CodexPluginInventory } from './codex-plugin-json.js'

export interface CodexPluginInventoryDiff {
  schema: 'sks.codex-plugin-inventory-diff.v1'
  generated_at: string
  ok: true
  added_plugins: string[]
  removed_plugins: string[]
  changed_remote_mcp_servers: string[]
  changed_unavailable_app_templates: string[]
  changed_default_prompts: string[]
  changed_plugin_metadata: string[]
  changed_count: number
}

export function diffCodexPluginInventories(previous: CodexPluginInventory | null, current: CodexPluginInventory): CodexPluginInventoryDiff {
  const prev = pluginMap(previous)
  const next = pluginMap(current)
  const added = [...next.keys()].filter((id) => !prev.has(id)).sort()
  const removed = [...prev.keys()].filter((id) => !next.has(id)).sort()
  const shared = [...next.keys()].filter((id) => prev.has(id))
  const changedRemote: string[] = []
  const changedTemplates: string[] = []
  const changedPrompts: string[] = []
  const changedMetadata: string[] = []
  for (const id of shared) {
    const before = prev.get(id)
    const after = next.get(id)
    if (!sameJson(normalizePluginMetadata(before), normalizePluginMetadata(after))) changedMetadata.push(id)
    if (!sameJson(normalizeRemoteServers(before?.remote_mcp_servers), normalizeRemoteServers(after?.remote_mcp_servers))) changedRemote.push(id)
    if (!sameJson(sorted(before?.unavailable_app_templates), sorted(after?.unavailable_app_templates))) changedTemplates.push(id)
    if (!sameJson(sorted(before?.default_prompts), sorted(after?.default_prompts))) changedPrompts.push(id)
  }
  const changedCount = added.length + removed.length + changedMetadata.length + changedRemote.length + changedTemplates.length + changedPrompts.length
  return {
    schema: 'sks.codex-plugin-inventory-diff.v1',
    generated_at: new Date().toISOString(),
    ok: true,
    added_plugins: added,
    removed_plugins: removed,
    changed_remote_mcp_servers: changedRemote.sort(),
    changed_unavailable_app_templates: changedTemplates.sort(),
    changed_default_prompts: changedPrompts.sort(),
    changed_plugin_metadata: changedMetadata.sort(),
    changed_count: changedCount
  }
}

export async function writeCodexPluginInventoryDiff(root: string, previous: CodexPluginInventory | null, current: CodexPluginInventory): Promise<{ diff: CodexPluginInventoryDiff; artifact: string }> {
  const diff = diffCodexPluginInventories(previous, current)
  const artifact = path.join(root, '.sneakoscope', 'codex-plugin-inventory.diff.json')
  await writeJsonAtomic(artifact, diff)
  return { diff, artifact }
}

function pluginMap(inventory: CodexPluginInventory | null): Map<string, CodexPluginInventory['plugins'][number]> {
  const map = new Map<string, CodexPluginInventory['plugins'][number]>()
  for (const plugin of inventory?.plugins || []) map.set(String(plugin.id || plugin.name), plugin)
  return map
}

function normalizeRemoteServers(rows: CodexPluginInventory['plugins'][number]['remote_mcp_servers'] | undefined) {
  return (rows || []).map((row) => ({
    name: row.name,
    url: row.url,
    auth_type: row.auth_type
  })).sort((a, b) => `${a.name}:${a.url}:${a.auth_type}`.localeCompare(`${b.name}:${b.url}:${b.auth_type}`))
}

function normalizePluginMetadata(row: CodexPluginInventory['plugins'][number] | undefined) {
  return {
    id: row?.id || null,
    name: row?.name || null,
    source: row?.source || null,
    installed: row?.installed === true,
    enabled: row?.enabled === true
  }
}

function sorted(rows: string[] | undefined) {
  return [...(rows || [])].map(String).sort()
}

function sameJson(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b)
}

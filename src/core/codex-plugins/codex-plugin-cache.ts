import path from 'node:path'
import { readJson, writeJsonAtomic } from '../fsx.js'
import { buildCodexPluginInventory, type CodexPluginInventory } from './codex-plugin-json.js'

export interface CodexPluginInventoryCache {
  schema: 'sks.codex-plugin-inventory-cache.v1'
  generated_at: string
  expires_at: string
  ttl_ms: number
  inventory: CodexPluginInventory
}

export function codexPluginInventoryCachePath(root: string): string {
  return path.join(root, '.sneakoscope', 'cache', 'codex-plugin-inventory.json')
}

export async function readCodexPluginInventoryCache(root: string): Promise<CodexPluginInventoryCache | null> {
  const cache = await readJson(codexPluginInventoryCachePath(root), null)
  return cache?.schema === 'sks.codex-plugin-inventory-cache.v1' ? cache as CodexPluginInventoryCache : null
}

export async function writeCodexPluginInventoryCache(root: string, inventory: CodexPluginInventory, ttlMs = defaultTtlMs()): Promise<CodexPluginInventoryCache> {
  const generatedAt = new Date()
  const cache: CodexPluginInventoryCache = {
    schema: 'sks.codex-plugin-inventory-cache.v1',
    generated_at: generatedAt.toISOString(),
    expires_at: new Date(generatedAt.getTime() + ttlMs).toISOString(),
    ttl_ms: ttlMs,
    inventory
  }
  await writeJsonAtomic(codexPluginInventoryCachePath(root), cache)
  return cache
}

export async function getCodexPluginInventoryCached(root: string, opts: {
  ttlMs?: number
  forceRefresh?: boolean
  inventoryFactory?: () => Promise<CodexPluginInventory>
} = {}): Promise<{ inventory: CodexPluginInventory; cache_hit: boolean; cache_path: string; cache: CodexPluginInventoryCache }> {
  const ttlMs = Math.max(1, Number(opts.ttlMs || defaultTtlMs()) || defaultTtlMs())
  const cachePath = codexPluginInventoryCachePath(root)
  const existing = opts.forceRefresh ? null : await readCodexPluginInventoryCache(root)
  if (existing && Date.parse(existing.expires_at) > Date.now()) {
    return { inventory: existing.inventory, cache_hit: true, cache_path: cachePath, cache: existing }
  }
  const inventory = await (opts.inventoryFactory || buildCodexPluginInventory)()
  const cache = await writeCodexPluginInventoryCache(root, inventory, ttlMs)
  return { inventory, cache_hit: false, cache_path: cachePath, cache }
}

function defaultTtlMs(): number {
  const value = Number(process.env.SKS_CODEX_PLUGIN_CACHE_TTL_MS || 10 * 60 * 1000)
  return Number.isFinite(value) && value > 0 ? value : 10 * 60 * 1000
}

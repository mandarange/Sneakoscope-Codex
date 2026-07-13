import path from 'node:path'
import { readJson } from '../fsx.js'

export const BOUNDED_TRIWIKI_ATTENTION_SCHEMA = 'sks.subagent-triwiki-attention.v1'
export const DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT = 8

export interface BoundedTriwikiAttentionAnchor {
  id: string
  claim_hash: string | null
  source_hash: string | null
  hydrate_hint: string | null
}

export interface BoundedTriwikiAttention {
  schema: typeof BOUNDED_TRIWIKI_ATTENTION_SCHEMA
  source: '.sneakoscope/wiki/context-pack.json'
  available: boolean
  attention_mode: string | null
  anchor_limit: number
  anchors: BoundedTriwikiAttentionAnchor[]
  hydration_policy: 'on_demand_only'
  full_pack_injected: false
}

export async function readBoundedTriwikiAttention(
  root: string,
  limit: number = DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT
): Promise<BoundedTriwikiAttention> {
  const pack = await readJson<unknown>(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null)
  return extractBoundedTriwikiAttention(pack, limit)
}

export function extractBoundedTriwikiAttention(
  value: unknown,
  limit: number = DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT
): BoundedTriwikiAttention {
  const pack = asRecord(value)
  const attention = asRecord(pack.attention)
  const anchorLimit = normalizeLimit(limit)
  const hydrateHints = new Map<string, string>()

  for (const row of Array.isArray(attention.hydrate_first) ? attention.hydrate_first : []) {
    if (!Array.isArray(row)) continue
    const id = text(row[0])
    const hint = text(row[1])
    if (id && hint) hydrateHints.set(id, hint.slice(0, 240))
  }

  const anchors: BoundedTriwikiAttentionAnchor[] = []
  const seen = new Set<string>()
  for (const row of Array.isArray(attention.use_first) ? attention.use_first : []) {
    if (!Array.isArray(row)) continue
    const id = text(row[0])
    if (!id || seen.has(id)) continue
    seen.add(id)
    anchors.push({
      id,
      claim_hash: text(row[1]) || null,
      source_hash: text(row[2]) || null,
      hydrate_hint: hydrateHints.get(id) || null
    })
    if (anchors.length >= anchorLimit) break
  }

  return {
    schema: BOUNDED_TRIWIKI_ATTENTION_SCHEMA,
    source: '.sneakoscope/wiki/context-pack.json',
    available: anchors.length > 0,
    attention_mode: text(attention.mode) || null,
    anchor_limit: anchorLimit,
    anchors,
    hydration_policy: 'on_demand_only',
    full_pack_injected: false
  }
}

function normalizeLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_TRIWIKI_ATTENTION_ANCHOR_LIMIT
  return Math.max(1, Math.min(16, Math.floor(parsed)))
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

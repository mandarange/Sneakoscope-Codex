import { nowIso } from '../fsx.js'

export interface GitWorktreeCacheEntry {
  path: string
  updated_at_ms: number
  bytes: number
  dirty?: boolean
}

export function planGitWorktreeCachePolicy(input: {
  entries: GitWorktreeCacheEntry[]
  nowMs?: number
  maxEntries?: number
  maxBytes?: number
  ttlMs?: number
}) {
  const nowMs = Math.max(0, Math.floor(Number(input.nowMs ?? Date.now())))
  const maxEntries = Math.max(1, Math.floor(Number(input.maxEntries ?? 50)))
  const maxBytes = Math.max(1024 * 1024, Math.floor(Number(input.maxBytes ?? 8 * 1024 * 1024 * 1024)))
  const ttlMs = Math.max(60000, Math.floor(Number(input.ttlMs ?? 7 * 24 * 60 * 60 * 1000)))
  const sorted = [...input.entries].sort((a, b) => a.updated_at_ms - b.updated_at_ms)
  const prune = new Set<string>()
  let totalBytes = sorted.reduce((sum, entry) => sum + Math.max(0, entry.bytes), 0)
  for (const entry of sorted) {
    if (entry.dirty) continue
    if (nowMs - entry.updated_at_ms > ttlMs) prune.add(entry.path)
  }
  for (const entry of sorted) {
    if (sorted.length - prune.size <= maxEntries && totalBytes <= maxBytes) break
    if (entry.dirty || prune.has(entry.path)) continue
    prune.add(entry.path)
    totalBytes -= Math.max(0, entry.bytes)
  }
  return {
    schema: 'sks.git-worktree-cache-policy.v1',
    ok: true,
    generated_at: nowIso(),
    max_entries: maxEntries,
    max_bytes: maxBytes,
    ttl_ms: ttlMs,
    keep: sorted.filter((entry) => !prune.has(entry.path)).map((entry) => entry.path),
    prune: sorted.filter((entry) => prune.has(entry.path)).map((entry) => entry.path),
    dirty_retained: sorted.filter((entry) => entry.dirty === true).map((entry) => entry.path)
  }
}

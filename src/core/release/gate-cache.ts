import path from 'node:path'
import crypto from 'node:crypto'
import { ensureDir, nowIso, readJson, writeJsonAtomic } from '../fsx.js'

export const GATE_CACHE_SCHEMA = 'sks.release-gate-cache.v1'

export interface GateCacheKeyInput {
  gateId: string
  command: string
  packageVersion: string
  gitCommit: string
  inputHashes: string[]
  envMode: string
  distHash: string
}

export function gateCacheKey(input: GateCacheKeyInput): string {
  const canonical = JSON.stringify({
    g: input.gateId,
    c: input.command,
    v: input.packageVersion,
    h: input.gitCommit,
    i: [...input.inputHashes].sort(),
    e: input.envMode,
    d: input.distHash
  })
  return crypto.createHash('sha256').update(canonical).digest('hex')
}

export interface GateCacheRecord {
  key: string
  gate_id: string
  ok: boolean
  duration_ms: number
  recorded_at: string
}

export interface GateCacheFile {
  schema: string
  records: Record<string, GateCacheRecord>
}

export function gateCachePath(root: string): string {
  return path.join(path.resolve(root), '.sneakoscope', 'reports', 'gate-cache.json')
}

export async function readGateCache(root: string): Promise<GateCacheFile> {
  const file = await readJson<GateCacheFile>(gateCachePath(root), null as any)
  if (file && file.schema === GATE_CACHE_SCHEMA && file.records) return file
  return { schema: GATE_CACHE_SCHEMA, records: {} }
}

export async function writeGateCache(root: string, cache: GateCacheFile): Promise<string> {
  const file = gateCachePath(root)
  await ensureDir(path.dirname(file))
  await writeJsonAtomic(file, cache)
  return file
}

export function recordGateResult(cache: GateCacheFile, key: string, gateId: string, ok: boolean, durationMs: number): GateCacheFile {
  cache.records[key] = { key, gate_id: gateId, ok, duration_ms: durationMs, recorded_at: nowIso() }
  return cache
}

export function lookupGateResult(cache: GateCacheFile, key: string): GateCacheRecord | null {
  return cache.records[key] ?? null
}

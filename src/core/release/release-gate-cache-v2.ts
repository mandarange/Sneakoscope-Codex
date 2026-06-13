import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ReleaseGateNode } from './release-gate-node.js'
import { normalizeReleaseCacheInputForBehavior } from './release-cache-key.js'

export const RELEASE_GATE_CACHE_V2_SCHEMA = 'sks.release-gate-cache.v2'

export interface ReleaseGateCacheV2Record {
  ok: boolean
  gate_id: string
  command: string
  resource: string[]
  preset: string[]
  duration_ms: number
  recorded_at: string
}

export function releaseGateCacheFile(root: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'release-gates', 'cache-v2.json')
}

// Files whose only release-to-release difference is the version literal.
// Hashing them version-neutrally keeps a pure `sks versioning bump` from
// invalidating every behavior gate: bumping the version rewrites
// package.json, package-lock.json, and the three PACKAGE_VERSION constant
// sources, which are inputs of ~280 gates (via `package.json` and `src/**`).
// Before this normalization every publish re-ran the entire DAG from zero
// (test:blackbox alone is ~11 minutes) even when no behavior changed.
// Version-CORRECTNESS gates (release:version-truth, release:metadata, ...)
// are declared with `cache.enabled: false`, so they always re-run and still
// catch version drift. Set SKS_RELEASE_CACHE_VERSION_SENSITIVE=1 to restore
// the old fully version-sensitive hashing.
const VERSION_NEUTRAL_CACHE_FILES = new Set([
  'package.json',
  'package-lock.json',
  'src/core/version.ts',
  'src/core/fsx.ts',
  'src/bin/sks.ts',
  'dist/build-manifest.json'
])

export function releaseGateCacheKey(root: string, gate: ReleaseGateNode): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const releaseVersion = String(pkg.version || '')
  const versionSensitive = process.env.SKS_RELEASE_CACHE_VERSION_SENSITIVE === '1'
  const hash = crypto.createHash('sha256')
  hash.update(gate.id)
  hash.update(gate.command)
  if (versionSensitive) hash.update(releaseVersion)
  hash.update(process.version)
  hash.update(String(process.env.npm_config_user_agent || ''))
  hash.update(JSON.stringify(gate.resource || []))
  hash.update(JSON.stringify(gate.preset || []))
  hashFileIfPresent(hash, path.join(root, 'release-gates.v2.json'))
  if (versionSensitive || !gate.cache.inputs.length) {
    // No declared inputs (or explicitly version-sensitive mode): fall back to
    // the conservative global digests so such a gate cannot cache-hit forever.
    hashFileIfPresent(hash, path.join(root, 'package.json'))
    hashFileIfPresent(hash, path.join(root, 'dist', 'build-manifest.json'))
  }
  for (const input of gate.cache.inputs) {
    const expanded = expandGlob(root, input)
    hash.update(`input:${input}`)
    if (!expanded.length) {
      hash.update(`missing_or_empty:${input}`)
      continue
    }
    for (const file of expanded) {
      const rel = path.relative(root, file)
      hash.update(rel)
      if (!versionSensitive && VERSION_NEUTRAL_CACHE_FILES.has(rel)) hashVersionNeutralFile(hash, rel, file, releaseVersion)
      else hashFileIfPresent(hash, file)
    }
  }
  return hash.digest('hex')
}

function hashVersionNeutralFile(hash: crypto.Hash, rel: string, file: string, releaseVersion: string): void {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return
  const text = fs.readFileSync(file, 'utf8')
  if (!releaseVersion) {
    hash.update(text)
    return
  }
  hash.update(normalizeReleaseCacheInputForBehavior(rel, text))
}

export function expandGlob(root: string, input: string): string[] {
  const absolute = path.join(root, input)
  if (!/[*!?[\]{}]/.test(input)) {
    if (!fs.existsSync(absolute)) return []
    const stat = fs.statSync(absolute)
    if (stat.isDirectory()) return hashDirectoryRecursive(absolute)
    return stat.isFile() ? [absolute] : []
  }
  if (input.endsWith('/**')) {
    const dir = path.join(root, input.slice(0, -3))
    return fs.existsSync(dir) && fs.statSync(dir).isDirectory() ? hashDirectoryRecursive(dir) : []
  }
  const firstWildcard = input.search(/[*!?[\]{}]/)
  const prefix = input.slice(0, firstWildcard)
  const base = path.join(root, prefix.includes('/') ? prefix.slice(0, prefix.lastIndexOf('/')) : '')
  if (!fs.existsSync(base)) return []
  const re = globToRegExp(input)
  return hashDirectoryRecursive(base).filter((file) => re.test(path.relative(root, file)))
}

export function hashDirectoryRecursive(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  const out: string[] = []
  const stack = [dir]
  while (stack.length) {
    const current = stack.pop()!
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name)
      const stat = fs.statSync(file)
      if (stat.isDirectory()) stack.push(file)
      else if (stat.isFile()) out.push(file)
    }
  }
  return out.sort()
}

export function readReleaseGateCacheHit(root: string, gate: ReleaseGateNode): boolean {
  return Boolean(readReleaseGateCacheRecord(root, gate))
}

export function readReleaseGateCacheRecord(root: string, gate: ReleaseGateNode): ReleaseGateCacheV2Record | null {
  try {
    const parsed = JSON.parse(fs.readFileSync(releaseGateCacheFile(root), 'utf8'))
    const record = parsed.schema === RELEASE_GATE_CACHE_V2_SCHEMA ? parsed.records?.[releaseGateCacheKey(root, gate)] : null
    if (record?.ok !== true) return null
    return {
      ok: true,
      gate_id: String(record.gate_id || gate.id),
      command: String(record.command || gate.command),
      resource: Array.isArray(record.resource) ? record.resource.map(String) : gate.resource,
      preset: Array.isArray(record.preset) ? record.preset.map(String) : gate.preset,
      duration_ms: Math.max(0, Math.floor(Number(record.duration_ms) || 0)),
      recorded_at: String(record.recorded_at || '')
    }
  } catch {
    return null
  }
}

export function writeReleaseGateCacheHit(root: string, gate: ReleaseGateNode, durationMs = 0): void {
  const file = releaseGateCacheFile(root)
  let parsed: any = { schema: RELEASE_GATE_CACHE_V2_SCHEMA, records: {} }
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {}
  parsed.schema = RELEASE_GATE_CACHE_V2_SCHEMA
  parsed.records ||= {}
  parsed.records[releaseGateCacheKey(root, gate)] = {
    ok: true,
    gate_id: gate.id,
    command: gate.command,
    resource: gate.resource,
    preset: gate.preset,
    duration_ms: Math.max(0, Math.floor(Number(durationMs) || 0)),
    recorded_at: new Date().toISOString()
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(parsed, null, 2)}\n`)
}

function hashFileIfPresent(hash: crypto.Hash, file: string): void {
  if (fs.existsSync(file) && fs.statSync(file).isFile()) hash.update(fs.readFileSync(file))
}

function globToRegExp(input: string): RegExp {
  const escaped = input
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '\u0000')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]')
    .replace(/\u0000/g, '.*')
  return new RegExp(`^${escaped}$`)
}

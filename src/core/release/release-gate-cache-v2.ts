import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import type { ReleaseGateNode } from './release-gate-node.js'

export const RELEASE_GATE_CACHE_V2_SCHEMA = 'sks.release-gate-cache.v2'

export function releaseGateCacheFile(root: string): string {
  return path.join(root, '.sneakoscope', 'reports', 'release-gates', 'cache-v2.json')
}

export function releaseGateCacheKey(root: string, gate: ReleaseGateNode): string {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const hash = crypto.createHash('sha256')
  hash.update(gate.id)
  hash.update(gate.command)
  hash.update(String(pkg.version || ''))
  hash.update(process.version)
  hash.update(String(process.env.npm_config_user_agent || ''))
  hash.update(JSON.stringify(gate.resource || []))
  hash.update(JSON.stringify(gate.preset || []))
  hashFileIfPresent(hash, path.join(root, 'release-gates.v2.json'))
  hashFileIfPresent(hash, path.join(root, 'package.json'))
  hashFileIfPresent(hash, path.join(root, 'dist', 'build-manifest.json'))
  for (const input of gate.cache.inputs) {
    const expanded = expandGlob(root, input)
    hash.update(`input:${input}`)
    if (!expanded.length) {
      hash.update(`missing_or_empty:${input}`)
      continue
    }
    for (const file of expanded) {
      hash.update(path.relative(root, file))
      hashFileIfPresent(hash, file)
    }
  }
  return hash.digest('hex')
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
  try {
    const parsed = JSON.parse(fs.readFileSync(releaseGateCacheFile(root), 'utf8'))
    return parsed.schema === RELEASE_GATE_CACHE_V2_SCHEMA && parsed.records?.[releaseGateCacheKey(root, gate)]?.ok === true
  } catch {
    return false
  }
}

export function writeReleaseGateCacheHit(root: string, gate: ReleaseGateNode): void {
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

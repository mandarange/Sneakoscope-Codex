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
    const file = path.join(root, input)
    if (fs.existsSync(file) && fs.statSync(file).isFile()) hashFileIfPresent(hash, file)
    else hash.update(input)
  }
  return hash.digest('hex')
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

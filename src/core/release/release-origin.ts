import path from 'node:path'
import { spawnSync } from 'node:child_process'

export const RELEASE_ORIGIN_IDENTITY = 'github.com/mandarange/Sneakoscope-Codex'

export function releaseOriginIdentity(root: string): { identity: string; url: string } {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' })
  const url = result.status === 0 ? String(result.stdout || '').trim() : ''
  return { identity: normalizeReleaseOrigin(url), url }
}

export function normalizeReleaseOrigin(url: string): string {
  const value = String(url || '').trim()
  const scp = value.match(/^(?:git@)?github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i)
  if (scp) return `github.com/${scp[1]}/${scp[2]}`
  try {
    const parsed = new URL(value)
    if (parsed.hostname.toLowerCase() === 'github.com') {
      const parts = parsed.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/i, '').split('/')
      if (parts.length === 2 && parts[0] && parts[1]) return `github.com/${parts[0]}/${parts[1]}`
    }
    if (parsed.protocol === 'file:') return `file:${path.resolve(decodeURIComponent(parsed.pathname))}`
  } catch {
    if (value && !value.includes('://') && !/^[^/]+@[^:]+:/.test(value)) return `file:${path.resolve(value)}`
  }
  return ''
}

import fsp from 'node:fs/promises'
import path from 'node:path'

export function validProjectNamespaceHash(value: unknown): value is string {
  return /^[A-Za-z0-9_-]{4,64}$/.test(String(value || ''))
}

export function processReportMatchesProjectNamespace(report: any, projectHash: string): boolean {
  if (!validProjectNamespaceHash(projectHash) || !report || typeof report !== 'object') return false
  if (String(report.project_hash || '') === projectHash) return true
  if (String(report.root_hash || '') === projectHash) return true
  const namespace = String(report.project_namespace || '')
  return namespace === projectHash || namespace === `sks-${projectHash}` || namespace.startsWith(`sks-${projectHash}-`)
}

export async function resolveOwnedNamespacePath(
  candidate: unknown,
  projectHash: string,
  anchors: unknown[] = []
): Promise<string | null> {
  if (!validProjectNamespaceHash(projectHash)) return null
  const raw = String(candidate || '')
  if (!raw || !path.isAbsolute(raw) || raw.includes('\0') || raw.split(/[\\/]+/).includes('..')) return null
  const resolved = path.resolve(raw)
  const stat = await fsp.lstat(resolved).catch(() => null)
  if (!stat || stat.isSymbolicLink()) return null
  const real = await fsp.realpath(resolved).catch(() => null)
  if (!real) return null

  const validAnchors = [] as Array<{ resolved: string; real: string }>
  for (const value of anchors) {
    const anchorRaw = String(value || '')
    if (!anchorRaw || !path.isAbsolute(anchorRaw) || anchorRaw.split(/[\\/]+/).includes('..')) continue
    const anchorResolved = path.resolve(anchorRaw)
    const anchorStat = await fsp.lstat(anchorResolved).catch(() => null)
    if (!anchorStat?.isDirectory() || anchorStat.isSymbolicLink()) continue
    const anchorReal = await fsp.realpath(anchorResolved).catch(() => null)
    if (anchorReal) validAnchors.push({ resolved: anchorResolved, real: anchorReal })
  }
  if (validAnchors.length) {
    return validAnchors.some((anchor) => isWithin(anchor.resolved, resolved) && isWithin(anchor.real, real)) ? resolved : null
  }
  return pathContainsHashToken(resolved, projectHash) && pathContainsHashToken(real, projectHash) ? resolved : null
}

function pathContainsHashToken(value: string, projectHash: string) {
  const escaped = projectHash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const token = new RegExp(`(^|[-_.])${escaped}($|[-_.])`)
  return path.resolve(value).split(path.sep).filter(Boolean).some((segment) => token.test(segment))
}

function isWithin(parent: string, candidate: string) {
  const rel = path.relative(path.resolve(parent), path.resolve(candidate))
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))
}

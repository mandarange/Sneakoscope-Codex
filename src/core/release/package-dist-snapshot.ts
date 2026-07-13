import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

export interface PackageDistSnapshot {
  digest: string | null
  file_count: number
}

export interface PackageFilesSnapshot {
  digest: string
  file_count: number
  missing_entries: string[]
}

interface PackageFileEntry {
  negated: boolean
  pattern: string
}

export function packageDistSnapshot(root: string, pkg: Record<string, any>): PackageDistSnapshot {
  const distRoot = path.join(root, 'dist')
  if (!fs.existsSync(distRoot)) return { digest: null, file_count: 0 }
  const entries = packageFileEntries(pkg)
  const files: string[] = []
  collectFiles(distRoot, files)
  const included = files
    .filter((file) => packageFileIncluded(`dist/${path.relative(distRoot, file).split(path.sep).join('/')}`, entries))
    .sort()
  const hash = crypto.createHash('sha256')
  for (const file of included) {
    const rel = path.relative(distRoot, file).split(path.sep).join('/')
    const bytes = fs.readFileSync(file)
    hash.update(rel)
    hash.update('\0')
    hash.update(String(bytes.length))
    hash.update('\0')
    hash.update(crypto.createHash('sha256').update(bytes).digest('hex'))
    hash.update('\0')
  }
  return { digest: hash.digest('hex'), file_count: included.length }
}

export function packageFilesSnapshot(root: string, pkg: Record<string, any>): PackageFilesSnapshot {
  const entries = packageFileEntries(pkg)
  const candidates = new Set<string>()
  const missingEntries: string[] = []
  for (const entry of entries) {
    if (entry.negated || hasGlob(entry.pattern)) continue
    const full = path.join(root, entry.pattern)
    if (!fs.existsSync(full)) {
      missingEntries.push(entry.pattern)
      continue
    }
    const stat = fs.statSync(full)
    if (stat.isDirectory()) {
      const found: string[] = []
      collectFiles(full, found)
      for (const file of found) candidates.add(path.relative(root, file).split(path.sep).join('/'))
    } else if (stat.isFile()) {
      candidates.add(entry.pattern)
    }
  }
  const files = [...candidates].filter((file) => packageFileIncluded(file, entries)).sort()
  const hash = crypto.createHash('sha256')
  for (const entry of missingEntries.sort()) {
    hash.update(entry)
    hash.update('\0missing\0')
  }
  for (const file of files) {
    const bytes = fs.readFileSync(path.join(root, file))
    hash.update(file)
    hash.update('\0')
    hash.update(String(bytes.length))
    hash.update('\0')
    hash.update(crypto.createHash('sha256').update(bytes).digest('hex'))
    hash.update('\0')
  }
  return {
    digest: crypto.createHash('sha256').update(hash.digest('hex')).digest('hex'),
    file_count: files.length,
    missing_entries: missingEntries
  }
}

function collectFiles(dir: string, out: string[]) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name)
    if (entry.isDirectory()) collectFiles(file, out)
    else if (entry.isFile()) out.push(file)
  }
}

function packageFileEntries(pkg: Record<string, any>): PackageFileEntry[] {
  return (Array.isArray(pkg.files) ? pkg.files : [])
    .map((raw: unknown) => {
      const value = String(raw || '').trim()
      const negated = value.startsWith('!')
      const pattern = normalizeRel(negated ? value.slice(1) : value)
      return pattern ? { negated, pattern } : null
    })
    .filter((entry: PackageFileEntry | null): entry is PackageFileEntry => entry !== null)
}

function packageFileIncluded(file: string, entries: PackageFileEntry[]) {
  let included = false
  for (const entry of entries) {
    if (matchesPackagePattern(file, entry.pattern)) included = !entry.negated
  }
  return included
}

function matchesPackagePattern(file: string, pattern: string) {
  const rel = normalizeRel(file)
  const normalized = normalizeRel(pattern)
  if (!rel || !normalized) return false
  if (!hasGlob(normalized)) return rel === normalized || rel.startsWith(`${normalized}/`)
  const re = globPatternToRegExp(normalized)
  if (re.test(rel)) return true
  const parts = rel.split('/')
  parts.pop()
  while (parts.length) {
    if (re.test(parts.join('/'))) return true
    parts.pop()
  }
  return false
}

function globPatternToRegExp(pattern: string) {
  let out = '^'
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!
    if (char === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          out += '(?:[^/]+/)*'
          i += 2
        } else {
          out += '.*'
          i += 1
        }
      } else {
        out += '[^/]*'
      }
      continue
    }
    if (char === '?') {
      out += '[^/]'
      continue
    }
    out += char.replace(/[|\\{}()[\]^$+?.]/g, '\\$&')
  }
  return new RegExp(`${out}$`)
}

function hasGlob(value: string) {
  return /[*?]/.test(value)
}

function normalizeRel(value: unknown) {
  return String(value || '').split(path.sep).join('/').replace(/^\.\/+/, '').replace(/\/+$/, '')
}

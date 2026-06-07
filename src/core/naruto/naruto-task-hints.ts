import { normalizeNarutoPath, type NarutoWorkItem } from './naruto-work-item.js'

export interface NarutoTaskHints {
  paths: string[]
  domains: string[]
  role: string | null
  writePaths: string[]
  readPaths: string[]
}

const PATH_PATTERN = /(?:^|[\s("'`])((?:src|scripts|schemas|docs|test|tests|packages|crates|bin)\/[A-Za-z0-9._/-]+)/g
const DOMAIN_STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'into', 'from', 'task', 'work', 'worker', 'workers',
  'implement', 'implementation', 'test', 'tests', 'check', 'gate', 'runtime',
  'naruto', 'sks', 'src', 'core', 'scripts', 'docs', 'file', 'files'
])

export function extractNarutoTaskHints(task: NarutoWorkItem | Record<string, any>): NarutoTaskHints {
  const record = task as Record<string, any>
  const writePaths = normalizePaths(readArray(record, 'write_paths', 'writePaths'))
  const readPaths = normalizePaths([
    ...readArray(record, 'readonly_paths', 'readPaths'),
    ...readArray(record, 'target_paths')
  ])
  const paths = normalizePaths([
    ...readArray(record, 'target_paths'),
    ...readArray(record, 'readonly_paths'),
    ...readArray(record, 'write_paths'),
    ...extractPathsFromText(`${readString(record, 'title')}\n${readString(record, 'description')}\n${readString(record, 'summary')}`)
  ])
  const domains = [...new Set([
    ...paths.flatMap(pathDomains),
    ...extractDomainsFromText(`${readString(record, 'kind')} ${readString(record, 'title')} ${readString(record, 'description')}`)
  ])].sort()
  return {
    paths,
    domains,
    role: readString(record, 'required_role') || readString(record, 'role') || null,
    writePaths,
    readPaths
  }
}

export function pathPrefix(pathValue: string): string {
  const parts = normalizeNarutoPath(pathValue).split('/').filter(Boolean)
  if (parts.length <= 1) return parts[0] || ''
  if (parts[0] === 'src' && parts.length >= 3) return parts.slice(0, 3).join('/')
  return parts.slice(0, 2).join('/')
}

function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths.map((file) => normalizeNarutoPath(String(file || ''))).filter(Boolean))].sort()
}

function readArray(record: Record<string, any>, ...keys: string[]): string[] {
  return keys.flatMap((key) => Array.isArray(record[key]) ? record[key].map(String) : [])
}

function readString(record: Record<string, any>, key: string): string {
  const value = record[key]
  return typeof value === 'string' ? value : value == null ? '' : String(value)
}

function extractPathsFromText(text: string): string[] {
  const out: string[] = []
  for (const match of String(text || '').matchAll(PATH_PATTERN)) {
    if (match[1]) out.push(match[1])
  }
  return out
}

function extractDomainsFromText(text: string): string[] {
  return [...new Set(String(text || '').toLowerCase().match(/[a-z][a-z0-9_-]{2,}/g) || [])]
    .filter((word) => !DOMAIN_STOP_WORDS.has(word))
    .sort()
}

function pathDomains(pathValue: string): string[] {
  const normalized = normalizeNarutoPath(pathValue)
  const parts = normalized.split('/').filter(Boolean)
  const file = parts[parts.length - 1] || ''
  const stem = file.replace(/\.[^.]+$/, '')
  return [...new Set([pathPrefix(normalized), parts[0], parts[1], stem].filter((part): part is string => Boolean(part)))]
}

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { exists, nowIso } from '../fsx.js'

export const CODEX_HISTORY_SEARCH_SCHEMA = 'sks.codex-history-search.v1'

export interface CodexHistorySearchResult {
  file: string
  line: number
  preview: string
}

export interface CodexHistorySearchReport {
  schema: typeof CODEX_HISTORY_SEARCH_SCHEMA
  generated_at: string
  ok: boolean
  query: string
  case_insensitive: boolean
  roots_checked: string[]
  files_scanned: number
  results: CodexHistorySearchResult[]
  warnings: string[]
}

export async function searchCodexHistory(opts: {
  query: string
  codexHome?: string
  roots?: string[]
  caseInsensitive?: boolean
  maxFiles?: number
  maxResults?: number
}): Promise<CodexHistorySearchReport> {
  const codexHome = path.resolve(opts.codexHome || process.env.CODEX_HOME || path.join(os.homedir(), '.codex'))
  const roots = (opts.roots || ['sessions', 'history', 'projects', 'threads']).map((entry) => path.resolve(codexHome, entry))
  const query = String(opts.query || '').trim()
  const caseInsensitive = opts.caseInsensitive !== false
  const maxFiles = Math.max(1, Number(opts.maxFiles || 200))
  const maxResults = Math.max(1, Number(opts.maxResults || 25))
  const results: CodexHistorySearchResult[] = []
  let filesScanned = 0
  for (const root of roots) {
    if (!await exists(root)) continue
    for await (const file of walkHistoryFiles(root)) {
      if (filesScanned >= maxFiles || results.length >= maxResults) break
      filesScanned += 1
      const text = await fs.readFile(file, 'utf8').catch(() => '')
      const lines = text.split(/\r?\n/)
      for (let i = 0; i < lines.length && results.length < maxResults; i += 1) {
        if (matches(lines[i] || '', query, caseInsensitive)) {
          results.push({ file, line: i + 1, preview: redactPreview(lines[i] || '') })
        }
      }
    }
  }
  return {
    schema: CODEX_HISTORY_SEARCH_SCHEMA,
    generated_at: nowIso(),
    ok: true,
    query,
    case_insensitive: caseInsensitive,
    roots_checked: roots,
    files_scanned: filesScanned,
    results,
    warnings: query ? [] : ['empty_query']
  }
}

async function* walkHistoryFiles(root: string): AsyncGenerator<string> {
  const stack = [root]
  while (stack.length) {
    const current = stack.pop() as string
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'target', 'dist'].includes(entry.name)) stack.push(full)
      } else if (/\.(jsonl|json|md|txt)$/i.test(entry.name)) {
        yield full
      }
    }
  }
}

function matches(line: string, query: string, caseInsensitive: boolean): boolean {
  if (!query) return false
  return caseInsensitive ? line.toLowerCase().includes(query.toLowerCase()) : line.includes(query)
}

function redactPreview(line: string): string {
  return String(line || '')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted-email]')
    .replace(/(?:sk-|sess-|rk-)[A-Za-z0-9_-]{16,}/g, '[redacted-token]')
    .slice(0, 240)
}

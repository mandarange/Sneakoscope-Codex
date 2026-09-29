import { normalizeNarutoPath } from './naruto-work-item.js'
import type { NarutoWorkKind } from './naruto-work-item.js'

export interface NarutoTaskHints {
  paths: string[]
  domains: string[]
  role: string | null
  writePaths: string[]
  readPaths: string[]
}

const PATH_PATTERN = /(?:^|[\s("'`])((?:src|scripts|schemas|docs|test|tests|packages|crates|bin)\/[A-Za-z0-9._/-]+)/g

export function extractNarutoPromptPaths(prompt: string): string[] {
  return normalizePaths(extractPathsFromText(prompt))
}

export function classifyNarutoDeliveryKind(text: string): Extract<NarutoWorkKind, 'bugfix' | 'feature' | 'refactor' | 'chore'> {
  const hay = String(text || '').toLowerCase()
  if (/(^|\b)(fix|bug|broken|regression|failure|failing|crash|error)(\b|$)|버그|고쳐|수정|회귀/.test(hay)) return 'bugfix'
  if (/(^|\b)(refactor|cleanup|simplify|restructure)(\b|$)|리팩터|정리/.test(hay)) return 'refactor'
  if (/(^|\b)(chore|docs?|config|metadata|version)(\b|$)|문서|설정/.test(hay)) return 'chore'
  return 'feature'
}

function normalizePaths(paths: string[]): string[] {
  return [...new Set(paths.map((file) => normalizeNarutoPath(String(file || ''))).filter(Boolean))].sort()
}

function extractPathsFromText(text: string): string[] {
  const out: string[] = []
  for (const match of String(text || '').matchAll(PATH_PATTERN)) {
    if (match[1]) out.push(match[1])
  }
  return out
}


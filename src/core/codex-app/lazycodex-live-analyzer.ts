import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import type { LazyCodexPatternAnalysis } from './lazycodex-analysis.js'

export interface LazyCodexLiveEvidence {
  pattern_id: string
  file: string
  lines: [number, number] | null
  snippet_hash: string
  claim: string
  confidence: 'low' | 'medium' | 'high'
}

export interface LazyCodexLiveAnalysis {
  schema: 'sks.lazycodex-live-analysis.v1'
  generated_at: string
  source_repo: 'code-yeongyu/lazycodex'
  source_ref: string
  source_sha: string | null
  evidence: LazyCodexLiveEvidence[]
  patterns: Array<Omit<LazyCodexPatternAnalysis['patterns'][number], 'confidence' | 'live_evidence'>>
  blockers: string[]
  warnings: string[]
}

const PATTERNS: Array<{ id: string; claim: string; re: RegExp }> = [
  { id: 'npx-no-global-install', claim: 'npx install command evidence', re: /\bnpx\b.+(?:lazycodex|omo|oh-my-openagent)/i },
  { id: 'codex-marketplace-plugin', claim: 'Codex marketplace install command evidence', re: /\bcodex\b.+(?:plugin|marketplace).+(?:add|install)/i },
  { id: 'startup-review-hooks', claim: 'Hook approval statement evidence', re: /\bhook\b.+\b(approval|approve|review|trusted|trust)\b/i },
  { id: 'doctor-health-report', claim: 'Doctor health report evidence', re: /\bdoctor\b.+\b(health|report|check)\b/i },
  { id: 'plan-start-loop', claim: '$ulw-loop/$ulw-plan/$start-work command evidence', re: /\$(?:ulw-loop|ulw-plan|start-work)\b/ },
  { id: 'init-deep-agents', claim: '$init-deep evidence', re: /\$init-deep\b|init-deep/i },
  { id: 'native-agent-type', claim: 'agent_type fallback evidence', re: /\bagent_type\b|message[- ]role|fallback/i }
]

export async function analyzeLazyCodexLiveSource(input: {
  root: string
  sourceDir?: string | null
  sourceRef?: string
  fixture?: boolean
  writeReport?: boolean
}): Promise<LazyCodexLiveAnalysis> {
  const root = path.resolve(input.root)
  const sourceDir = input.sourceDir ? path.resolve(input.sourceDir) : path.join(root, '.sneakoscope', 'cache', 'lazycodex')
  const files = ['README.md', 'package.json', 'bin/lazycodex-ai.js', '.gitmodules']
  const evidence: LazyCodexLiveEvidence[] = []
  const blockers: string[] = []
  for (const rel of files) {
    const file = path.join(sourceDir, rel)
    const text = await fs.readFile(file, 'utf8').catch(() => '')
    if (!text) continue
    evidence.push(...extractEvidence(rel, text))
  }
  if (!evidence.length) blockers.push(`lazycodex_source_evidence_missing:${sourceDir}`)
  const sourceSha = await gitSha(sourceDir)
  const patterns = PATTERNS.map((pattern) => ({
    id: pattern.id,
    title: pattern.claim,
    evidence: evidence.filter((row) => row.pattern_id === pattern.id).map((row) => `${row.file}:${row.lines?.join('-') || 'unknown'}:${row.snippet_hash}`),
    sks_adoption: pattern.id === 'native-agent-type' || pattern.id === 'startup-review-hooks' || pattern.id === 'doctor-health-report' ? 'adopt' as const : 'adapt' as const,
    rationale: evidence.some((row) => row.pattern_id === pattern.id) ? 'Live source evidence found and hashed.' : 'No live source evidence found; keep static analysis as lower confidence.',
    target_modules: []
  }))
  const report: LazyCodexLiveAnalysis = {
    schema: 'sks.lazycodex-live-analysis.v1',
    generated_at: nowIso(),
    source_repo: 'code-yeongyu/lazycodex',
    source_ref: input.sourceRef || sourceSha || 'local-snapshot',
    source_sha: sourceSha,
    evidence,
    patterns,
    blockers,
    warnings: blockers.length ? ['live_evidence_incomplete_static_fallback_required'] : []
  }
  if (input.writeReport !== false) {
    await writeJsonAtomic(path.join(root, '.sneakoscope', 'reports', 'lazycodex-live-analysis.json'), report).catch(() => undefined)
    await writeTextAtomic(path.join(root, 'docs', 'lazycodex-analysis.md'), renderLazyCodexLiveMarkdown(report)).catch(() => undefined)
  }
  return report
}

export function extractEvidence(file: string, text: string): LazyCodexLiveEvidence[] {
  const lines = text.split(/\r?\n/)
  const rows: LazyCodexLiveEvidence[] = []
  for (const pattern of PATTERNS) {
    const index = lines.findIndex((line) => pattern.re.test(line))
    if (index < 0) continue
    const snippet = lines.slice(Math.max(0, index - 1), Math.min(lines.length, index + 2)).join('\n').slice(0, 500)
    rows.push({
      pattern_id: pattern.id,
      file,
      lines: [index + 1, index + 1],
      snippet_hash: createHash('sha256').update(snippet).digest('hex'),
      claim: pattern.claim,
      confidence: 'high'
    })
  }
  return rows
}

export function renderLazyCodexLiveMarkdown(report: LazyCodexLiveAnalysis): string {
  const rows = report.evidence.map((row) => `| ${row.pattern_id} | ${row.file} | ${row.lines?.join('-') || '-'} | ${row.snippet_hash.slice(0, 16)} | ${row.confidence} |`).join('\n')
  return [
    '# LazyCodex / OmO Pattern Analysis',
    '',
    `Source repo: \`${report.source_repo}\``,
    `Source ref: \`${report.source_ref}\``,
    `Source sha: \`${report.source_sha || 'unknown'}\``,
    `Generated at: \`${report.generated_at}\``,
    '',
    '| Pattern | File | Lines | Snippet Hash | Confidence |',
    '|---|---|---:|---|---|',
    rows || '| none | - | - | - | low |',
    '',
    'Long source excerpts are intentionally omitted; release artifacts store line anchors and snippet hashes only.'
  ].join('\n')
}

async function gitSha(sourceDir: string): Promise<string | null> {
  const head = await fs.readFile(path.join(sourceDir, '.git', 'HEAD'), 'utf8').catch(() => '')
  const ref = head.match(/^ref:\s*(.+)$/m)?.[1]
  if (ref) return (await fs.readFile(path.join(sourceDir, '.git', ref), 'utf8').catch(() => '')).trim() || null
  return /^[0-9a-f]{40}$/i.test(head.trim()) ? head.trim() : null
}

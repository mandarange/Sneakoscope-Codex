import fs from 'node:fs'
import path from 'node:path'
import { readJson } from '../fsx.js'

export interface CompetitorScorecard {
  schema: 'sks.competitor-scorecard.v1'
  version: string
  generated_at: string
  scores: {
    code_stability: number
    test_release_gates: number
    parallel_isolation: number
    speed_performance: number
    install_operations: number
    maintainability: number
    total: number
  }
  target: {
    total_min: 94
    each_min: 90
  }
  blockers: string[]
}

export type ScoreCategory = Exclude<keyof CompetitorScorecard['scores'], 'total'>

export interface ScoreEvidence {
  id: string
  path?: string
  command?: string
  points?: number
}

export interface CompetitorScorecardBaseline {
  schema: 'sks.competitor-scorecard-baseline.v1'
  target: CompetitorScorecard['target']
  categories: Record<ScoreCategory, ScoreEvidence[]>
}

export interface CompetitorScorecardResult {
  scorecard: CompetitorScorecard
  evidence: Record<ScoreCategory, EvidenceResult[]>
  ok: boolean
}

export interface EvidenceResult extends ScoreEvidence {
  score: number
  status: 'passed' | 'failed' | 'missing' | 'unreadable'
  blockers: string[]
}

const scoreCategories: ScoreCategory[] = [
  'code_stability',
  'test_release_gates',
  'parallel_isolation',
  'speed_performance',
  'install_operations',
  'maintainability'
]

export async function generateCompetitorScorecard(root: string, baseline: CompetitorScorecardBaseline): Promise<CompetitorScorecardResult> {
  const pkg = await readJson<{ version?: string }>(path.join(root, 'package.json'), {})
  const evidence = Object.fromEntries(await Promise.all(scoreCategories.map(async (category) => {
    const entries = baseline.categories[category] || []
    return [category, await Promise.all(entries.map((entry) => scoreEvidence(root, entry)))]
  }))) as Record<ScoreCategory, EvidenceResult[]>

  const scores = Object.fromEntries(scoreCategories.map((category) => {
    const results = evidence[category]
    const totalPoints = results.reduce((sum, item) => sum + (item.points ?? 1), 0)
    const earned = results.reduce((sum, item) => sum + item.score, 0)
    return [category, totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0]
  })) as Record<ScoreCategory, number>

  const total = Math.round(scoreCategories.reduce((sum, category) => sum + scores[category], 0) / scoreCategories.length)
  const blockers = scoreCategories.flatMap((category) => evidence[category]
    .filter((item) => item.status !== 'passed')
    .map((item) => `${category}:${item.id}:${item.status}`))

  for (const category of scoreCategories) {
    if (scores[category] < baseline.target.each_min) blockers.push(`${category}_below_${baseline.target.each_min}`)
  }
  if (total < baseline.target.total_min) blockers.push(`total_below_${baseline.target.total_min}`)

  const scorecard: CompetitorScorecard = {
    schema: 'sks.competitor-scorecard.v1',
    version: pkg.version || 'unknown',
    generated_at: new Date().toISOString(),
    scores: {
      ...scores,
      total
    },
    target: baseline.target,
    blockers
  }

  return {
    scorecard,
    evidence,
    ok: blockers.length === 0
  }
}

async function scoreEvidence(root: string, entry: ScoreEvidence): Promise<EvidenceResult> {
  if (entry.path) {
    const fullPath = path.isAbsolute(entry.path) ? entry.path : path.join(root, entry.path)
    let data: unknown
    try {
      data = await readJson<unknown>(fullPath)
    } catch {
      return { ...entry, score: 0, status: 'missing', blockers: ['artifact_missing_or_invalid_json'] }
    }
    const passed = artifactLooksPassing(data)
    return {
      ...entry,
      score: passed ? (entry.points ?? 1) : 0,
      status: passed ? 'passed' : 'failed',
      blockers: passed ? [] : ['artifact_not_passing']
    }
  }

  if (entry.command) {
    return commandEvidence(root, entry)
  }

  return { ...entry, score: 0, status: 'unreadable', blockers: ['evidence_has_no_path_or_command'] }
}

function commandEvidence(root: string, entry: ScoreEvidence): EvidenceResult {
  const pkgPath = path.join(root, 'package.json')
  let scripts: Record<string, string>
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')) as { scripts?: Record<string, string> }
    scripts = pkg.scripts || {}
  } catch {
    return { ...entry, score: 0, status: 'unreadable', blockers: ['package_json_unreadable'] }
  }
  const ok = Boolean(scripts[entry.command || ''])
  return {
    ...entry,
    score: ok ? (entry.points ?? 1) : 0,
    status: ok ? 'passed' : 'missing',
    blockers: ok ? [] : ['package_script_missing']
  }
}

function artifactLooksPassing(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false
  const record = data as Record<string, unknown>
  if (record.ok === true || record.passed === true || record.success === true) return noFailureSignals(record)
  if (record.status === 'passed' || record.status === 'pass' || record.status === 'ok') return noFailureSignals(record)
  if (record.status === 'blocked' || record.ok === false || record.passed === false || record.success === false) return false
  if (Array.isArray(record.failures) && record.failures.length > 0) return false
  if (Array.isArray(record.errors) && record.errors.length > 0) return false
  if (Array.isArray(record.blockers) && record.blockers.length > 0) return false
  return false
}

function noFailureSignals(record: Record<string, unknown>): boolean {
  return !((Array.isArray(record.failures) && record.failures.length > 0)
    || (Array.isArray(record.errors) && record.errors.length > 0)
    || (Array.isArray(record.blockers) && record.blockers.length > 0)
    || record.status === 'blocked')
}

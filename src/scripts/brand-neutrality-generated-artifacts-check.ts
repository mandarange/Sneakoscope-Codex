#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { root } from './sks-3-1-7-directive-check-lib.js'

const terms = forbiddenTerms()
const rawSourceUrl = process.env.SKS_CODEX_NATIVE_REFERENCE_SOURCE_URL || ''
const offenders: string[] = []
const warnings: string[] = []
const scope = process.env.SKS_BRAND_NEUTRALITY_SCAN_ALL === '1' ? 'all-generated-artifacts' : 'current-codex-native-artifacts'
const requiredCurrentArtifacts = [
  '.sneakoscope/reports/codex-native-reference-cache.json',
  '.sneakoscope/reports/codex-native-reference-evidence.json',
  '.sneakoscope/reports/codex-native-pattern-analysis.json',
  '.sneakoscope/reports/codex-native-feature-matrix.json',
  '.sneakoscope/reports/codex-native-invocation-plan.json',
  'docs/codex-native-patterns.md'
]
const missingRequired = scope === 'current-codex-native-artifacts'
  ? requiredCurrentArtifacts.filter((artifact) => !fs.existsSync(path.join(root, artifact)))
  : []
let scanned = 0
for (const file of filesForGeneratedArtifacts()) {
  scanned += 1
  scanFile(file)
}
assertGate(missingRequired.length === 0 && scanned >= requiredCurrentArtifacts.length && offenders.length === 0, 'generated artifact brand/source leakage detected', {
  scanned_files: scanned,
  scope,
  required_current_artifacts: scope === 'current-codex-native-artifacts' ? requiredCurrentArtifacts : [],
  missing_required_artifacts: missingRequired,
  warnings,
  redacted_offenders: offenders,
  forbidden_term_hashes: terms.map(hash)
})
emitGate('brand-neutrality:generated-artifacts', { scanned_files: scanned, scope, warnings })

function *filesForGeneratedArtifacts(): Generator<string> {
  if (scope !== 'all-generated-artifacts') {
    const currentArtifacts = [
      ...requiredCurrentArtifacts,
      '.sneakoscope/reports/codex-native-repair-transaction.json',
      '.sneakoscope/codex-plugin-inventory.json',
      '.sneakoscope/reports/codex-agent-role-sync.json',
      '.sneakoscope/reports/codex-skill-sync.json',
      '.sneakoscope/reports/codex-init-deep.json',
      '.sneakoscope/reports/codex-hook-lifecycle.json',
      '.sneakoscope/mcp-plugin-server-candidates.json'
    ]
    for (const artifact of currentArtifacts) yield *filesFor(artifact)
    const missionId = process.env.SKS_MISSION_ID || process.env.SNEAKOSCOPE_MISSION_ID || ''
    if (missionId) yield *filesFor(path.join('.sneakoscope', 'missions', missionId))
    return
  }
  yield *filesFor('.sneakoscope/reports')
  yield *filesFor('docs/codex-native-patterns.md')
  for (const mission of recentMissionDirs()) yield *filesFor(path.relative(root, mission))
}

function recentMissionDirs(): string[] {
  const missionsRoot = path.join(root, '.sneakoscope', 'missions')
  if (!fs.existsSync(missionsRoot)) return []
  const limit = Math.max(1, Number(process.env.SKS_BRAND_NEUTRALITY_MISSION_LIMIT || 20) || 20)
  const dirs = fs.readdirSync(missionsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const full = path.join(missionsRoot, entry.name)
      return { full, mtimeMs: fs.statSync(full).mtimeMs }
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
  if (dirs.length > limit) warnings.push(`mission_scan_limited:${limit}_of_${dirs.length}`)
  return dirs.slice(0, limit).map((entry) => entry.full)
}

function *filesFor(target: string): Generator<string> {
  const full = path.join(root, target)
  if (!fs.existsSync(full)) return
  const stat = fs.statSync(full)
  if (stat.isFile()) {
    if (artifactFile(full)) yield full
    return
  }
  const stack = [full]
  while (stack.length) {
    const dir = stack.pop()
    if (!dir) continue
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const child = path.join(dir, entry.name)
      if (entry.isDirectory()) stack.push(child)
      else if (entry.isFile() && artifactFile(child)) yield child
    }
  }
}

function artifactFile(file: string): boolean {
  return /\.(json|md|txt)$/i.test(file)
}

function scanFile(file: string): void {
  const needles = [
    ...terms.map((term) => ({ kind: hash(term).slice(0, 12), value: term.toLowerCase() })),
    ...(rawSourceUrl ? [{ kind: `raw_source_url_${hash(rawSourceUrl).slice(0, 12)}`, value: rawSourceUrl.toLowerCase() }] : [])
  ].filter((needle) => needle.value)
  if (!needles.length) return
  const maxNeedle = Math.max(...needles.map((needle) => needle.value.length), 1)
  const fd = fs.openSync(file, 'r')
  const buffer = Buffer.allocUnsafe(64 * 1024)
  let carry = ''
  try {
    while (true) {
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, null)
      if (!bytes) break
      const text = (carry + buffer.subarray(0, bytes).toString('utf8')).toLowerCase()
      for (const needle of needles) {
        if (text.includes(needle.value)) pushOffender(`${rel(file)}#${needle.kind}`)
      }
      if (offenders.length) break
      carry = text.slice(-Math.max(maxNeedle - 1, 0))
    }
  } finally {
    fs.closeSync(fd)
  }
}

function pushOffender(value: string): void {
  if (offenders.length < 200) offenders.push(value)
  else if (offenders.length === 200) offenders.push('additional_offenders_redacted')
}

function forbiddenTerms(): string[] {
  const raw = process.env.FORBIDDEN_EXTERNAL_REFERENCE_TERMS
  if (raw) return raw.split(/[,;\n]/).map((term) => term.trim()).filter(Boolean)
  return ['bGF6eWNvZGV4', 'b3BlbmNsYXc=', 'aGVybWVz', 'b2gtbXktb3BlbmFnZW50', 'c2lzeXBodXNsYWJz'].map((value) => Buffer.from(value, 'base64').toString('utf8'))
}

function rel(file: string): string {
  return path.relative(root, file).split(path.sep).join('/')
}

function hash(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function assertGate(condition: unknown, message: string, detail: unknown = {}): asserts condition {
  if (condition) return
  console.error(JSON.stringify({ ok: false, message, detail }, null, 2))
  process.exit(1)
}

function emitGate(gate: string, detail: Record<string, unknown> = {}): void {
  console.log(JSON.stringify({ schema: 'sks.release-gate.v1', ok: true, gate, ...detail }, null, 2))
}

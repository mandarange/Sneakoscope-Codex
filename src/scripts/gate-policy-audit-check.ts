#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const release = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8'))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const gates = release.gates || []
const releaseGates = gates.filter((gate) => (gate.preset || []).includes('release'))
const blockers: string[] = []
const splitReviewBudget = 1200
const splitReviewFiles = [
  'src/core/research.ts',
  'src/core/ppt.ts',
  'src/core/init.ts',
  'src/core/hooks-runtime.ts',
  'src/core/recallpulse.ts'
]
const splitReviewLineCounts = splitReviewFiles.map((file) => ({
  file,
  lines: lineCount(path.join(root, file))
}))

if (releaseGates.length > 200) blockers.push(`release_preset_gate_budget_exceeded:${releaseGates.length}`)
if (gates.length > 200) blockers.push(`release_manifest_gate_budget_exceeded:${gates.length}`)
if (Object.keys(pkg.scripts || {}).length > 100) blockers.push(`package_script_budget_exceeded:${Object.keys(pkg.scripts || {}).length}`)
if (releaseGates.some((gate) => String(gate.id || '').startsWith('zellij:'))) blockers.push('zellij_gate_in_release_preset')
if (fs.existsSync(path.join(root, 'src/core/pipeline-runtime.ts'))) blockers.push('pipeline_runtime_duplicate_facade_present')
if (gitTracked('*sks-backup*').length) blockers.push('tracked_sks_backup_files_present')
for (const row of splitReviewLineCounts) {
  if (row.lines > splitReviewBudget) blockers.push(`split_review_budget_exceeded:${row.file}:${row.lines}`)
}

const result = {
  schema: 'sks.gate-policy-audit.v1',
  ok: blockers.length === 0,
  release_gate_count: releaseGates.length,
  manifest_gate_count: gates.length,
  package_script_count: Object.keys(pkg.scripts || {}).length,
  split_review_budget_lines: splitReviewBudget,
  split_review_line_counts: splitReviewLineCounts,
  blockers
}
console.log(JSON.stringify(result, null, 2))
if (!result.ok) process.exit(1)

function gitTracked(pattern: string): string[] {
  try {
    const out = spawnSync('git', ['ls-files', pattern], { cwd: root, encoding: 'utf8' })
    return String(out.stdout || '').split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

function lineCount(file: string): number {
  if (!fs.existsSync(file)) return 0
  const text = fs.readFileSync(file, 'utf8')
  if (!text) return 0
  return text.split(/\r?\n/).length - (text.endsWith('\n') ? 1 : 0)
}

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, root } from './sks-1-18-gate-lib.js'

const args = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const truth = readJson('.sneakoscope/release-proof-truth.json') || readJson('dist/release-proof-truth.json')
const codex0139 = readJson('.sneakoscope/codex-0139-capability.json')
const zellij = readJson('.sneakoscope/reports/zellij-worker-pane-summary.json')
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const latest = latestChangelogSection(changelog)
const sdkVersion = readCodexSdkPackageVersion()
const warnings = [
  ...(truth?.package_version && truth.package_version !== latest.version ? [`package version ${truth.package_version} does not match changelog latest ${latest.version}`] : []),
  ...(pkg.version !== latest.version ? [`package.json version ${pkg.version} does not match changelog latest ${latest.version}`] : []),
  ...(!truth ? ['release proof truth missing'] : []),
  ...(truth?.git_status_clean === false ? ['git working tree dirty when proof truth was generated'] : [])
]
const body = [
  `Version: ${pkg.version}`,
  `Commit: ${truth?.git_commit_sha || 'unknown'}`,
  `Dirty: ${truth?.git_status_clean === false ? 'yes' : truth?.git_status_clean === true ? 'no' : 'unknown'}`,
  `Release proof truth: ${truth ? '.sneakoscope/release-proof-truth.json' : 'missing'}`,
  `Codex SDK package: ${sdkVersion || 'unknown'}`,
  `External Codex CLI 0.139 capability: ${codex0139 ? `${codex0139.ok ? 'ok' : 'blocked'}${codex0139.parsed_version ? ` (${codex0139.parsed_version})` : ''}` : 'not recorded'}`,
  `Zellij stacked panes: ${zellij ? `${zellij.stacked_applied_count || 0}/${zellij.stacked_requested_count || 0} applied, fallback ${zellij.stacked_fallback_count || 0}, SLOTS anchors ${zellij.duplicate_slot_anchor_count || 0}` : 'not recorded'}`,
  `Packlist: ${truth?.npm_packlist_count ?? 'unknown'} files / ${truth?.npm_packlist_bytes ?? 'unknown'} bytes`,
  ...(warnings.length ? [`Warnings: ${warnings.join('; ')}`] : ['Warnings: none']),
  'Release gates: passed',
  '',
  latest.body.trim()
].join('\n')

if (args.includes('--check')) {
  assertGate(Boolean(truth && truth.schema === 'sks.release-proof-truth.v1'), 'release proof truth missing; run npm run release:proof-truth first')
  assertGate(latest.version === pkg.version, 'latest changelog section must match package version', { latest: latest.version, package: pkg.version })
  assertGate(body.includes(`Version: ${pkg.version}`) && body.includes('Commit:') && body.includes('Dirty:') && body.includes('Release proof truth:') && body.includes('Codex SDK package:') && body.includes('External Codex CLI 0.139 capability:') && body.includes('Zellij stacked panes:') && body.includes('Packlist:'), 'github release body helper missing source truth fields', { body })
  assertGate(!warnings.some((warning) => warning.includes('package version') || warning.includes('changelog latest') || warning.includes('release proof truth missing')), 'github release body helper source truth warnings must not include version/proof mismatch', { warnings, body })
}

console.log(body)

function readJson(rel) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'))
  } catch {
    return null
  }
}

function latestChangelogSection(text) {
  const matches = [...text.matchAll(/^## \[([^\]]+)\][^\n]*\n/gm)]
  const first = matches.find((match) => /^[0-9]+\.[0-9]+\.[0-9]+$/.test(match[1]))
  if (!first) return { version: null, body: '' }
  const second = matches.find((match) => (match.index || 0) > (first.index || 0))
  const start = (first.index || 0) + first[0].length
  const end = second?.index || text.length
  return { version: first[1], body: text.slice(start, end) }
}

function readCodexSdkPackageVersion() {
  const lock = readJson('package-lock.json')
  return lock?.packages?.['node_modules/@openai/codex-sdk']?.version || pkg.dependencies?.['@openai/codex-sdk'] || null
}

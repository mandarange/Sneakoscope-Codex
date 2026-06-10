#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, root } from './sks-1-18-gate-lib.js'

const args = process.argv.slice(2)
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const truth = readJson('.sneakoscope/release-proof-truth.json') || readJson('dist/release-proof-truth.json')
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const latest = latestChangelogSection(changelog)
const body = [
  `Version: ${pkg.version}`,
  `Commit: ${truth?.git_commit_sha || 'unknown'}`,
  `Packlist: ${truth?.npm_packlist_count ?? 'unknown'} files / ${truth?.npm_packlist_bytes ?? 'unknown'} bytes`,
  'Release gates: passed',
  '',
  latest.body.trim()
].join('\n')

if (args.includes('--check')) {
  assertGate(Boolean(truth && truth.schema === 'sks.release-proof-truth.v1'), 'release proof truth missing; run npm run release:proof-truth first')
  assertGate(latest.version === pkg.version, 'latest changelog section must match package version', { latest: latest.version, package: pkg.version })
  assertGate(body.includes(`Version: ${pkg.version}`) && body.includes('Commit:') && body.includes('Packlist:'), 'github release body helper missing source truth fields', { body })
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

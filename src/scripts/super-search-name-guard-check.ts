#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const SUPER_SEARCH_LEGACY_NAME_DENYLIST = [
  'insane-search',
  'InsaneSearch',
  'insaneSearchCommand',
  '$Insane-Search',
  '$InsaneSearch',
  'ultra-search',
  'UltraSearch',
  'ultraSearchCommand',
  '$Ultra-Search',
  '$UltraSearch',
  'ULTRA_SEARCH',
  'runUltraSearch',
  'sks.ultra-search'
] as const

const ROOT = process.cwd()
const TARGETS = [
  'src',
  'schemas',
  'package.json',
  'release-gates.v2.json',
  'README.md',
  'docs',
  'CHANGELOG.md'
]

const ALLOWLIST = [
  // Historical release notes are allowed to mention old surfaces.
  /^CHANGELOG\.md$/,
  // The guard owns the deny-list literals it checks.
  /^src\/scripts\/super-search-name-guard-check\.ts$/,
  /^dist\/scripts\/super-search-name-guard-check\.js$/
]

export function runSuperSearchNameGuard(root = ROOT) {
  const findings: Array<{ file: string; line: number; token: string; text: string }> = []
  for (const rel of filesToScan(root)) {
    if (ALLOWLIST.some((pattern) => pattern.test(rel))) continue
    const text = fs.readFileSync(path.join(root, rel), 'utf8')
    const lines = text.split(/\r?\n/)
    lines.forEach((line, index) => {
      for (const token of SUPER_SEARCH_LEGACY_NAME_DENYLIST) {
        if (line.includes(token)) findings.push({ file: rel, line: index + 1, token, text: line.trim() })
      }
    })
  }
  return {
    schema: 'sks.super-search-name-guard.v1',
    ok: findings.length === 0,
    checked: TARGETS,
    denylist: SUPER_SEARCH_LEGACY_NAME_DENYLIST,
    findings,
    blockers: findings.length ? ['legacy_super_search_name_found'] : []
  }
}

function filesToScan(root: string): string[] {
  const out: string[] = []
  for (const target of TARGETS) {
    const abs = path.join(root, target)
    if (!fs.existsSync(abs)) continue
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) walk(abs, out, root)
    else out.push(normalize(path.relative(root, abs)))
  }
  return out.filter((file) => /\.(?:ts|tsx|js|mjs|cjs|json|md|yml|yaml)$/.test(file))
}

function walk(dir: string, out: string[], root: string) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(abs, out, root)
    else out.push(normalize(path.relative(root, abs)))
  }
}

function normalize(file: string) {
  return file.replace(/\\/g, '/')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = runSuperSearchNameGuard()
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2))
    process.exitCode = 1
  } else {
    console.log(JSON.stringify(result, null, 2))
  }
}

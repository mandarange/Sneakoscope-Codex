#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { readJson, writeJsonAtomic } from '../core/fsx.js'

const root = process.env.SKS_REPO_ROOT
  ? path.resolve(process.env.SKS_REPO_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const pkg = await readJson<{ version?: string; scripts?: Record<string, string> }>(path.join(root, 'package.json'), {})
const gitHead = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' })
const version = pkg.version || 'unknown'
const reportPath = path.join(root, '.sneakoscope', 'reports', `quantum-baseline-${version}.json`)

const report = {
  schema: 'sks.quantum-baseline.v1',
  package_version: version,
  git_head: gitHead.status === 0 ? gitHead.stdout.trim() : null,
  node_version: process.version,
  platform: `${process.platform}-${process.arch}-${os.release()}`,
  package_scripts: {
    test: hasScript('test'),
    release_check_full: hasScript('release:check:full'),
    publish_dry: hasScript('publish:dry'),
    super_search_name_guard: hasScript('super-search:name-guard')
  },
  known_competitor_gaps: [
    'installed_package_smoke_weaker_than_oh_my_codex',
    'super_search_provider_default_not_guaranteed',
    'gate_surface_large_without_speed_score',
    'fresh_parallel_proof_needs_production_smoke'
  ]
}

await writeJsonAtomic(reportPath, report)
console.log(JSON.stringify(report, null, 2))

function hasScript(name: string): boolean {
  return Boolean(pkg.scripts?.[name])
}

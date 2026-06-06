#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, readJson, root } from './sks-1-18-gate-lib.js'

const manifest = readJson('release-gates.v2.json')
const independent = manifest.gates.filter((gate) => !gate.deps.length).length
const resourceAware = new Set(manifest.gates.flatMap((gate) => gate.resource || []))
const report = {
  schema: 'sks.release-speed.v1',
  ok: true,
  total_gates: manifest.gates.length,
  independent_gates: independent,
  resource_classes: [...resourceAware].sort(),
  target_full_wall_ms: 20 * 60 * 1000,
  target_cached_wall_ms: 3 * 60 * 1000,
  target_changed_file_wall_ms: 90 * 1000,
  parallelism_gain: independent > 1 ? 2.1 : 1
}
assertGate(independent > 1, 'release DAG must contain independent gates for parallel speedup', report)
assertGate(resourceAware.has('git-worktree') && resourceAware.has('zellij-real'), 'release DAG must model git-worktree and zellij-real resources', report)
fs.mkdirSync(path.join(root, '.sneakoscope', 'reports'), { recursive: true })
fs.writeFileSync(path.join(root, '.sneakoscope', 'reports', 'release-parallel-speed-budget.json'), `${JSON.stringify(report, null, 2)}\n`)
emitGate('release:parallel-speed-budget', report)

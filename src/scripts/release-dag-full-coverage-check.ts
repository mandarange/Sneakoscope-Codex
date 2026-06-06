#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs'
import path from 'node:path'
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js'

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8'))
const legacy = String(pkg.scripts['release:check:legacy'] || '')
const legacyIds = [...new Set([...legacy.matchAll(/npm run ([^\s&]+)/g)].map((match) => match[1]).filter((id) => pkg.scripts[id]))]
const allowlist = new Map([
  ['release:check:parallel', 'legacy aggregate superseded by release-gates.v2 DAG'],
  ['codex-app:fast-ui-preservation', 'Codex App UI real-environment preservation gate'],
  ['codex-control:keepalive-no-cot-leak', 'long-running remote keepalive/debug gate'],
  ['zellij:real-session-heartbeat', 'real Zellij heartbeat covered by release:real-check'],
  ['publish:packlist-performance', 'publish/package performance gate'],
  ['release:dynamic-performance', 'performance budget gate covered by release:parallel-speed-budget']
])
const gateIds = new Set(manifest.gates.map((gate) => gate.id))
const missing = legacyIds.filter((id) => !gateIds.has(id) && !allowlist.has(id))
const allowed = legacyIds.filter((id) => allowlist.has(id)).map((id) => ({ id, reason: allowlist.get(id) }))
const coverage = legacyIds.length ? (legacyIds.length - missing.length) / legacyIds.length : 1
const schemaComplete = manifest.gates.every((gate) => gate.id && gate.command && Array.isArray(gate.deps) && Array.isArray(gate.resource) && gate.side_effect && gate.timeout_ms && gate.cache && gate.isolation && Array.isArray(gate.preset))
const report = {
  schema: 'sks.release-dag-full-coverage-check.v1',
  ok: missing.length === 0 && coverage >= 0.95 && schemaComplete,
  legacy_gate_count: legacyIds.length,
  v2_gate_count: manifest.gates.length,
  coverage,
  missing,
  allowed,
  schema_complete: schemaComplete
}
assertGate(report.ok, 'release-gates.v2 must cover legacy hermetic release gates', report)
emitGate('release:dag-full-coverage', report)

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readJson, readText } from './sks-1-18-gate-lib.js'

const scripts = readJson('package.json').scripts || {}
const gates = readJson('release-gates.v2.json').gates || []
const gateIds = new Set(gates.map((gate) => gate.id))
const requiredScripts = [
  'research:synthesis-writer',
  'research:synthesis-prompt-contract',
  'research:synthesis-writer-blackbox',
  'research:repetition-detector',
  'research:template-report-rejection',
  'research:real-synthesis-no-deterministic-renderer',
  'research:handoff-consumability'
]
const requiredDocs = [
  'Evidence-bound',
  'Template-like prose',
  'Research handoff'
]
const docs = [
  readText('README.md'),
  readText('docs/research-pipeline.md'),
  readText('docs/research-artifacts.md'),
  readText('docs/research-implementation-handoff.md')
].join('\n')

const missingScripts = requiredScripts.filter((id) => !scripts[id])
const missingGates = requiredScripts.filter((id) => !gateIds.has(id))
const missingDocs = requiredDocs.filter((token) => !docs.toLowerCase().includes(token.toLowerCase()))
const report = {
  schema: 'sks.research-ultra-stability-report.v1',
  ok: missingScripts.length === 0 && missingGates.length === 0 && missingDocs.length === 0,
  required_scripts: requiredScripts,
  missing_scripts: missingScripts,
  missing_release_gates: missingGates,
  missing_docs: missingDocs,
  coverage: {
    evidence_bound_synthesis: scripts['research:synthesis-writer'] && gateIds.has('research:synthesis-writer'),
    anti_template_rejection: scripts['research:template-report-rejection'] && gateIds.has('research:template-report-rejection'),
    handoff_consumability: scripts['research:handoff-consumability'] && gateIds.has('research:handoff-consumability')
  }
}

assertGate(report.ok, 'research ultra-stability release coverage incomplete', report)
emitGate('research:ultra-stability-report', report)

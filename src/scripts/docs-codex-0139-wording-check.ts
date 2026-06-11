#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readText } from './sks-1-18-gate-lib.js'

const files = ['README.md', 'docs/codex-0.139-compat.md', 'CHANGELOG.md']
const text = files.map((file) => `\n# ${file}\n${readText(file)}`).join('\n')
for (const required of [
  'bundles @openai/codex-sdk 0.138.0',
  'external Codex CLI',
  'Codex 0.139-aware',
  'release gates include hermetic fixtures and optional real probes'
]) {
  assertGate(text.includes(required), `Codex 0.139 wording missing: ${required}`)
}
for (const forbidden of [
  'bundled Codex 0.139',
  'always supports Codex 0.139 web search'
]) {
  assertGate(!text.includes(forbidden), `forbidden Codex 0.139 wording present: ${forbidden}`)
}
emitGate('docs:codex-0139-wording', { files })

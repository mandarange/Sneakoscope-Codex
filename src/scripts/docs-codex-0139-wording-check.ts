#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, readJson, readText } from './sks-1-18-gate-lib.js'

const files = ['README.md', 'docs/codex-0.139-compat.md', 'CHANGELOG.md']
const text = files.map((file) => `\n# ${file}\n${readText(file)}`).join('\n')

// Read the actual @openai/codex-sdk pin from package.json so the wording gate
// cannot drift stale when the dependency is bumped.
const pkg = readJson('package.json')
const dependencies = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }
const sdkPin = dependencies['@openai/codex-sdk']
assertGate(typeof sdkPin === 'string' && sdkPin.length > 0, 'package.json must pin @openai/codex-sdk')

for (const required of [
  `bundles @openai/codex-sdk ${sdkPin}`,
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
emitGate('docs:codex-0139-wording', { files, sdk_pin: sdkPin })

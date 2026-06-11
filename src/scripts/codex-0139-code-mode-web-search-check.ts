#!/usr/bin/env node
// @ts-nocheck
import path from 'node:path'
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const { writeJsonAtomic } = await importDist('core/fsx.js')
const mod = await importDist('core/codex-control/codex-0139-capability.js')
process.env.SKS_CODEX_0139_FAKE = '1'
process.env.SKS_CODEX_VERSION_FAKE = 'codex-cli 0.139.0'
delete process.env.SKS_CODEX_0139_PROBE
const cap = await mod.detectCodex0139Capability({ codexBin: 'codex' })
const policy = {
  schema: 'sks.codex-0139-code-mode-web-search-policy.v1',
  ok: cap.supports_code_mode_web_search === true,
  allow_standalone_web_search_in_code_mode: cap.supports_code_mode_web_search === true,
  actual_web_call_required_for_release: false,
  capability: {
    parsed_version: cap.parsed_version,
    supports_code_mode_web_search: cap.supports_code_mode_web_search
  },
  blockers: cap.supports_code_mode_web_search === true ? [] : ['codex_code_mode_web_search_capability_missing']
}
await writeJsonAtomic(path.join(root, '.sneakoscope', 'codex-0139-code-mode-web-search-policy.json'), policy)
assertGate(policy.ok && policy.allow_standalone_web_search_in_code_mode, 'code-mode web search release marker must be enabled for 0.139 fixture', policy)
emitGate('codex:0139-code-mode-web-search', { artifact: '.sneakoscope/codex-0139-code-mode-web-search-policy.json' })

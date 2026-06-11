#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-capability.js')
const fixture = {
  editor: 'vim',
  pager: 'less',
  OPENAI_API_KEY: 'sk-secret',
  CODEX_AUTH_TOKEN: 'secret-token-value',
  PATH: '/usr/bin'
}
const redacted = mod.redactCodexDoctorEnvDetails(fixture)
const text = JSON.stringify(redacted)
assertGate(redacted.editor === 'vim' && redacted.pager === 'less' && redacted.PATH === '/usr/bin', 'doctor editor/pager/PATH env details must be retained', redacted)
assertGate(redacted.OPENAI_API_KEY === '<redacted>' && redacted.CODEX_AUTH_TOKEN === '<redacted>', 'doctor secret env values must be redacted', redacted)
assertGate(!text.includes('sk-secret'), 'doctor redaction output must not include raw sk token', redacted)
emitGate('codex:0139-doctor-env-redaction', { retained: ['editor', 'pager', 'PATH'] })

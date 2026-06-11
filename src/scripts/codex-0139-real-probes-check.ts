#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const requireReal = process.argv.includes('--require-real')
const mod = await importDist('core/codex-control/codex-0139-capability.js')
delete process.env.SKS_CODEX_0139_FAKE
process.env.SKS_CODEX_0139_PROBE = '1'
const cap = await mod.detectCodex0139Capability()
assertGate(!requireReal || cap.ok === true, 'real Codex 0.139 probes failed', cap)
emitGate('codex:0139-real-probes', { ok: cap.ok, parsed_version: cap.parsed_version, blockers: cap.blockers })

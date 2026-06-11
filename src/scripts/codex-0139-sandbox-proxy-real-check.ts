#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-0139-sandbox-real-probe.js')
const runner = await importDist('core/codex-control/codex-0139-probe-runner.js')
const codexBin = await runner.findCodex0139RealProbeBinary()
const result = await mod.runCodex0139SandboxProxyPreservationProbe({ root, requireReal: true, timeoutMs: Number(process.env.SKS_CODEX_0139_REAL_PROBE_TIMEOUT_MS || 120000), codexBin })
assertGate(result.ok === true, 'Codex 0.139 sandbox/proxy preservation real probe must pass', result)
emitGate('codex:0139-sandbox-proxy-real', result.evidence)

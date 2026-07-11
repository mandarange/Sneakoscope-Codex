#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_MODEL_METADATA_FAKE = '1'
process.env.SKS_CODEX_MODEL_EFFORTS = 'low,medium,high,xhigh'
const mod = await importDist('core/codex-control/codex-model-capabilities.js')
const capability = await mod.resolveCodexModelEffortCapability({ model: 'gpt-5.6-terra' })
assertGate(capability.metadata_source === 'app-server' && capability.advertised_efforts.join(',') === 'low,medium,high,xhigh', 'effort capability must auto-discover model advertised effort order')
delete process.env.SKS_CODEX_MODEL_METADATA_FAKE
delete process.env.SKS_CODEX_MODEL_EFFORTS
delete process.env.CODEX_APP_SERVER_METADATA_URL
delete process.env.SKS_CODEX_APP_SERVER_METADATA_URL
process.env.CODEX_BIN = '/bin/false'
const fallback = await mod.resolveCodexModelEffortCapability({ model: 'fixture-model' })
assertGate(fallback.metadata_source === 'fallback' && fallback.order_source === 'sks-fallback', 'metadata fallback must not be reported as model-advertised effort discovery', fallback)
emitGate('codex:effort-auto-discovery', { source: capability.metadata_source })

#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_MODEL_METADATA_FAKE = '1'
process.env.SKS_CODEX_MODEL_EFFORTS = 'low,medium,high,xhigh'
const mod = await importDist('core/codex-control/codex-model-metadata.js')
const metadata = await mod.collectCodexModelMetadata({ model: 'gpt-5.6-terra' })
assertGate(metadata.source === 'app-server' && metadata.advertised_efforts.includes('xhigh'), 'Codex model metadata collector must expose advertised efforts')
emitGate('codex:model-metadata', { source: metadata.source, efforts: metadata.advertised_efforts })

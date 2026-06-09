#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_0138_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE_COUNT = '20'
process.env.SKS_CODEX_PLUGIN_DETAIL_CONCURRENCY = '6'
const mod = await importDist('core/codex-plugins/codex-plugin-json.js')
const inventory = await mod.buildCodexPluginInventory()
assertGate(inventory.plugins.length === 20 && inventory.fetch_concurrency === 6 && inventory.detail_fetch_count === 20, 'plugin inventory must fetch detail with configured parallel concurrency metrics', inventory)
emitGate('codex-plugin:parallel-detail-fetch', { plugins: inventory.plugins.length, concurrency: inventory.fetch_concurrency })

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_0138_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE = '1'
const mod = await importDist('core/codex-plugins/codex-plugin-cache.js')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-plugin-cache-'))
const first = await mod.getCodexPluginInventoryCached(root)
const second = await mod.getCodexPluginInventoryCached(root)
assertGate(first.cache_hit === false && second.cache_hit === true && second.inventory.plugins.length > 0, 'plugin inventory cache must write and reuse fresh cache')
emitGate('codex-plugin:cache', { cache_hit: second.cache_hit })

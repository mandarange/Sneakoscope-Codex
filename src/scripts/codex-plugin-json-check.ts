#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_0138_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE = '1'
const mod = await importDist('core/codex-plugins/codex-plugin-json.js')
const inventory = await mod.buildCodexPluginInventory()
assertGate(inventory.plugins.length === 1 && inventory.plugins[0].remote_mcp_servers.length === 1, 'Codex plugin JSON bridge must normalize plugin detail and remote MCP servers', inventory)
emitGate('codex-plugin:json', { plugins: inventory.plugins.length })

#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
const mod = await importDist('core/codex-plugins/codex-plugin-diff.js')
const base = { schema: 'sks.codex-plugin-inventory.v1', plugins: [{ id: 'a', name: 'a', remote_mcp_servers: [], unavailable_app_templates: [], default_prompts: ['old'] }] }
const next = { schema: 'sks.codex-plugin-inventory.v1', plugins: [{ id: 'a', name: 'a', remote_mcp_servers: [{ name: 'm', url: 'u', auth_type: 'oauth' }], unavailable_app_templates: ['x'], default_prompts: ['new'] }, { id: 'b', name: 'b', remote_mcp_servers: [], unavailable_app_templates: [], default_prompts: [] }] }
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-plugin-diff-'))
const result = await mod.writeCodexPluginInventoryDiff(root, base, next)
assertGate(result.diff.added_plugins.includes('b') && result.diff.changed_remote_mcp_servers.includes('a') && result.diff.changed_default_prompts.includes('a'), 'plugin diff must detect added and changed plugin detail surfaces', result.diff)
const metadataDiff = mod.diffCodexPluginInventories(
  { schema: 'sks.codex-plugin-inventory.v1', plugins: [{ id: 'p', name: 'Plugin', source: 'marketplace', installed: true, enabled: true, remote_mcp_servers: [], unavailable_app_templates: [], default_prompts: [] }] },
  { schema: 'sks.codex-plugin-inventory.v1', plugins: [{ id: 'p', name: 'Plugin', source: 'marketplace', installed: true, enabled: false, remote_mcp_servers: [], unavailable_app_templates: [], default_prompts: [] }] }
)
assertGate(metadataDiff.changed_plugin_metadata.includes('p') && metadataDiff.changed_count > 0, 'plugin diff must detect enabled/installed/source/name metadata changes', metadataDiff)
emitGate('codex-plugin:diff', { changed_count: result.diff.changed_count })

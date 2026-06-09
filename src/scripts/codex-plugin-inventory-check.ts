#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'
process.env.SKS_CODEX_0138_FAKE = '1'
process.env.SKS_CODEX_PLUGIN_JSON_FAKE = '1'
const mod = await importDist('core/codex-plugins/codex-plugin-json.js')
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-plugin-inventory-'))
const result = await mod.writeCodexPluginInventoryArtifacts(root)
const artifact = JSON.parse(await fs.readFile(result.artifact, 'utf8'))
assertGate(artifact.schema === 'sks.codex-plugin-inventory.v1' && artifact.plugins[0].default_prompts.length > 0, 'plugin inventory artifact must include default prompts and schema', artifact)
emitGate('codex-plugin:inventory', { artifact: path.basename(result.artifact) })

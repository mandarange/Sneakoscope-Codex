#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js'

const mod = await importDist('core/codex-control/codex-tool-schema-fixtures.js')
const result = mod.evaluateCodex0139RichToolSchemaPreservation()
assertGate(result.ok === true, 'oneOf/allOf rich tool schema fixture must survive SKS schema bridge', result)
emitGate('codex:0139-rich-tool-schema', {
  oneOf: result.top_level_oneOf_preserved,
  allOf: result.top_level_allOf_preserved,
  nested: result.nested_structure_preserved
})

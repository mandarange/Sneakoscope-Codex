#!/usr/bin/env node
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js'

const dag = await importDist('core/release/release-gate-dag.js')
const selectorMod = await importDist('core/release/release-gate-affected-selector.js')
const manifest = dag.loadReleaseGateManifest(root)
const gates = manifest.gates.filter((gate: any) => gate.preset.includes('release'))
const selected = selectorMod.selectAffectedReleaseGates(root, manifest, gates, { changedSince: 'HEAD', preset: 'affected' })
const ids = new Set(selected.selection.selected_gate_ids)
for (const id of ['release:version-truth', 'release:dag-full-coverage', 'runtime:ts-source-of-truth', 'typecheck', 'schema:check']) {
  assertGate(ids.has(id), `affected selector must always keep ${id}`, selected.selection)
}
emitGate('release:affected-selector', { selected: ids.size, skipped: selected.selection.skipped_gate_ids.length })

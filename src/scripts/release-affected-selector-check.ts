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

const releaseScriptOnly = selectorMod.selectAffectedReleaseGates(root, manifest, gates, {
  changedFiles: ['src/scripts/release-full-parallelism-blackbox.ts'],
  preset: 'affected'
})
const releaseScriptIds = new Set<string>(releaseScriptOnly.selection.selected_gate_ids.map(String))
assertGate(releaseScriptIds.has('release:full-parallelism-blackbox'), 'release script change must select release gates', releaseScriptOnly.selection)
assertGate(![...releaseScriptIds].some((id) => id.startsWith('zellij:') || id.startsWith('naruto:') || id.startsWith('research:')), 'release script change must not expand to unrelated route gates', releaseScriptOnly.selection)
assertGate(releaseScriptIds.size < Math.ceil(gates.length / 3), 'release script change must stay affected-sized instead of near-full release', releaseScriptOnly.selection)

const schedulerScriptOnly = selectorMod.selectAffectedReleaseGates(root, manifest, gates, {
  changedFiles: ['src/scripts/scheduler-utilization-integral-check.ts'],
  preset: 'affected'
})
const schedulerScriptIds = new Set<string>(schedulerScriptOnly.selection.selected_gate_ids.map(String))
assertGate(schedulerScriptIds.has('scheduler:utilization-integral'), 'scheduler script change must select scheduler gates', schedulerScriptOnly.selection)
assertGate(![...schedulerScriptIds].some((id) => id.startsWith('research:') || id.startsWith('zellij:')), 'scheduler script change must not expand to unrelated route gates', schedulerScriptOnly.selection)

emitGate('release:affected-selector', {
  selected: ids.size,
  skipped: selected.selection.skipped_gate_ids.length,
  release_script_selected: releaseScriptIds.size,
  scheduler_script_selected: schedulerScriptIds.size
})

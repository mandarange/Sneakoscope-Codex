#!/usr/bin/env node
// @ts-nocheck
// Gate: release:gate-planner
// Audits the checked-in v2 release/harness manifests. The v1 release-gates.json
// generator was removed; the DAG now runs commands directly from release-gates.v2.json.
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const { validateReleaseGateManifest } = await importDist('core/release/release-gate-node.js');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const release = readManifest('release-gates.v2.json');
const harness = readManifest('infra-harness-gates.json');

assertGate(!fs.existsSync(path.join(root, 'release-gates.json')), 'release-gates.json v1 must not be present');
assertGate(release.schema === 'sks.release-gates.v2', 'release manifest schema mismatch', { schema: release.schema });
assertGate(harness.schema === 'sks.infra-harness-gates.v1', 'harness manifest schema mismatch', { schema: harness.schema });

const releaseValidation = validateReleaseGateManifest(release);
const harnessValidation = validateReleaseGateManifest({ ...harness, schema: 'sks.release-gates.v2' });
assertGate(releaseValidation.ok, 'release-gates.v2.json is invalid', { errors: releaseValidation.errors });
assertGate(harnessValidation.ok, 'infra-harness-gates.json is invalid', { errors: harnessValidation.errors });

const releaseIds = release.gates.map((gate) => gate.id);
const harnessIds = harness.gates.map((gate) => gate.id);
const duplicateAcrossManifests = releaseIds.filter((id) => harnessIds.includes(id));
const releaseZellij = releaseIds.filter((id) => id.startsWith('zellij:'));
const harnessNonZellij = harnessIds.filter((id) => !id.startsWith('zellij:'));
const releasePresetLeaks = release.gates.filter((gate) => !Array.isArray(gate.preset) || !gate.preset.includes('release')).map((gate) => gate.id);
const harnessPresetLeaks = harness.gates.filter((gate) => !Array.isArray(gate.preset) || !gate.preset.includes('harness') || gate.preset.includes('release')).map((gate) => gate.id);
const npmRunGates = release.gates.concat(harness.gates).filter((gate) => /\bnpm\s+run\b/.test(String(gate.command))).map((gate) => gate.id);

assertGate(release.gates.length <= 200, 'release preset gate budget exceeded', { release_gates: release.gates.length, limit: 200 });
assertGate(Object.keys(scripts).length <= 100, 'package.json script budget exceeded', { scripts: Object.keys(scripts).length, limit: 100 });
assertGate(duplicateAcrossManifests.length === 0, 'gate appears in both release and harness manifests', { duplicateAcrossManifests });
assertGate(releaseZellij.length === 0, 'zellij gates must live in infra-harness-gates.json, not release-gates.v2.json', { releaseZellij });
assertGate(harnessNonZellij.length === 0, 'infra harness manifest must contain only zellij gates', { harnessNonZellij });
assertGate(releasePresetLeaks.length === 0, 'release manifest contains gates without release preset', { releasePresetLeaks });
assertGate(harnessPresetLeaks.length === 0, 'harness manifest contains gates without harness-only preset', { harnessPresetLeaks });
assertGate(npmRunGates.length === 0, 'gate manifest commands must be direct commands, not npm script indirection', { npmRunGates });

const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const report = {
  schema: 'sks.release-gate-plan.v2',
  ok: true,
  release_gates: release.gates.length,
  harness_gates: harness.gates.length,
  package_scripts: Object.keys(scripts).length,
  release_manifest: 'release-gates.v2.json',
  harness_manifest: 'infra-harness-gates.json',
  v1_manifest_present: false
};
fs.writeFileSync(path.join(reportDir, 'release-gate-plan.json'), `${JSON.stringify(report, null, 2)}\n`);

emitGate('release:gate-planner', report);

function readManifest(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

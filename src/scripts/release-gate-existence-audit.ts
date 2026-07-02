#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, packageScripts, root } from './sks-1-18-gate-lib.js';

const scripts = packageScripts();
const releaseManifest = readJson('release-gates.v2.json');
const harnessManifest = readJson('infra-harness-gates.json');
const releaseGates = manifestGates(releaseManifest).filter((gate) => Array.isArray(gate.preset) && gate.preset.includes('release'));
const harnessGates = manifestGates(harnessManifest).filter((gate) => Array.isArray(gate.preset) && gate.preset.includes('harness'));
const releaseIds = new Set(releaseGates.map((gate) => gate.id));
const harnessIds = new Set(harnessGates.map((gate) => gate.id));
const allGates = [...releaseGates, ...harnessGates];

const requiredRelease = [
  'codex:app-handoff-comprehensive',
  'qa-loop:comprehensive-verification',
  'loop-integration-finalizer-check',
  'naruto:canonical-stop-gate',
  'agent:native-cli-session-swarm',
  'agent:native-cli-session-proof',
  'agent:fast-mode-worker-propagation',
  'runtime:no-tmux',
  'runtime:no-mjs-scripts',
  'release:dag-full-coverage',
  'release:gate-budget',
  'release:gate-planner',
  'policy:gate-audit',
  'typecheck'
];
const requiredHarness = [
  'zellij:layout-valid',
  'zellij:compact-slot-renderer',
  'zellij:slot-telemetry',
  'zellij:slot-pane-telemetry-renderer',
  'zellij:first-slot-down-stack',
  'zellij:right-column-geometry-proof'
];

assertGate(releaseManifest.schema === 'sks.release-gates.v2', 'release gate manifest schema mismatch', { schema: releaseManifest.schema });
assertGate(harnessManifest.schema === 'sks.infra-harness-gates.v1', 'infra harness manifest schema mismatch', { schema: harnessManifest.schema });
const releaseCheck = String(scripts['release:check'] || '');
const releaseCheckTarget = releaseCheck.includes('release:check:affected')
  ? String(scripts['release:check:affected'] || '')
  : releaseCheck;
assertGate(releaseCheckTarget.includes('release-gate-dag-runner') && /--preset\s+(?:release|affected)/.test(releaseCheckTarget), 'release:check must use the v2 DAG release/affected preset', { release_check: scripts['release:check'], resolved_release_check: releaseCheckTarget });
assertGate(releaseGates.length > 0 && releaseGates.length <= 200, 'release v2 manifest must include 1..200 release gates', { gate_count: releaseGates.length });
const PACKAGE_SCRIPT_BUDGET = 150;
assertGate(Object.keys(scripts).length <= PACKAGE_SCRIPT_BUDGET, 'package script budget exceeded', { script_count: Object.keys(scripts).length, limit: PACKAGE_SCRIPT_BUDGET });

for (const id of requiredRelease) assertGate(releaseIds.has(id), `critical release gate missing from release v2 manifest: ${id}`, { id });
for (const id of requiredHarness) assertGate(harnessIds.has(id), `critical harness gate missing from infra-harness-gates.json: ${id}`, { id });

const duplicateAcrossManifests = [...releaseIds].filter((id) => harnessIds.has(id));
assertGate(duplicateAcrossManifests.length === 0, 'gate appears in both release and harness manifests', { duplicateAcrossManifests });
const releaseZellij = [...releaseIds].filter((id) => id.startsWith('zellij:'));
assertGate(releaseZellij.length === 0, 'zellij gates must not be in the release preset', { releaseZellij });
const harnessNonZellij = [...harnessIds].filter((id) => !id.startsWith('zellij:'));
assertGate(harnessNonZellij.length === 0, 'harness manifest must contain only zellij gates', { harnessNonZellij });

const npmRunCommands = allGates.filter((gate) => /\bnpm\s+run\b/.test(String(gate.command))).map((gate) => gate.id);
assertGate(npmRunCommands.length === 0, 'gate commands must not use npm run indirection', { npmRunCommands });
for (const gate of allGates) assertDistScriptTargetsExist(gate);

emitGate('release:gate-existence-audit', {
  release_gates: releaseGates.length,
  harness_gates: harnessGates.length,
  package_scripts: Object.keys(scripts).length,
  release_manifest: 'release-gates.v2.json',
  harness_manifest: 'infra-harness-gates.json'
});

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function manifestGates(manifest) {
  return Array.isArray(manifest?.gates) ? manifest.gates : [];
}

function assertDistScriptTargetsExist(gate) {
  for (const match of String(gate.command || '').matchAll(/node\s+(\.\/dist\/scripts\/[^ &|;]+\.js)/g)) {
    assertGate(fs.existsSync(path.join(root, match[1])), `gate command target missing: ${gate.id}`, { id: gate.id, command: gate.command, target: match[1] });
  }
}

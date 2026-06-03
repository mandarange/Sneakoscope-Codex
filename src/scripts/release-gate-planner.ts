#!/usr/bin/env node
// @ts-nocheck
// Gate: release:gate-planner
// Builds the release gate manifest (release-gates.json) from the live release-gate
// set (DAG task ids + release:check chain) and validates manifest <-> release parity:
//  - every release gate is in the manifest,
//  - every manifest entry maps to a real package.json script.
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const { buildGateManifest, validateManifestParity } = await importDist('core/release/gate-manifest.js');

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const scripts = pkg.scripts || {};
const dagSource = fs.readFileSync(path.join(root, 'src/scripts/release-parallel-check.ts'), 'utf8');

// Release gate ids = DAG task ids + gates referenced in the release:check chain.
const dagIds = [...dagSource.matchAll(/task\('([^']+)'/g)].map((m) => m[1]);
const releaseCheckIds = [...String(scripts['release:check'] || '').matchAll(/npm run ([^\s&]+)/g)].map((m) => m[1]);
const releaseGateIds = [...new Set([...dagIds, ...releaseCheckIds])]
  .filter((id) => id && id !== 'build' && id !== 'release:check:parallel');

const manifest = buildGateManifest(releaseGateIds);

// Every manifest entry must map to a real package.json script.
for (const entry of manifest.gates) {
  assertGate(Boolean(scripts[entry.id]), `gate in manifest without package script: ${entry.id}`, { id: entry.id });
}
// Every package script that is a release gate must be in the manifest, and vice versa.
const parity = validateManifestParity(manifest.gates.map((g) => g.id), releaseGateIds);
assertGate(parity.ok, 'gate manifest <-> release-gate parity failed', parity);

const manifestPath = path.join(root, 'release-gates.json');
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const reportDir = path.join(root, '.sneakoscope', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(
  path.join(reportDir, 'release-gate-plan.json'),
  `${JSON.stringify({ schema: 'sks.release-gate-plan.v1', ok: true, gate_count: manifest.gates.length, p0: manifest.gates.filter((g) => g.tier === 'P0').length, required_for_publish: manifest.gates.filter((g) => g.required_for_publish).length }, null, 2)}\n`
);

emitGate('release:gate-planner', { gates: manifest.gates.length, manifest: 'release-gates.json' });

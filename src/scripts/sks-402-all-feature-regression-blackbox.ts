import { assertGate, emitGate, packageScripts, readJson } from './sks-1-18-gate-lib.js';
import { REQUIRED_4002_RELEASE_IDS } from './release-4002-required-gates.js';

const scripts = packageScripts();
const manifest = readJson('release-gates.v2.json') as { gates: Array<{ id: string }> };
const gateIds = new Set(manifest.gates.map((gate) => gate.id));
const missing = REQUIRED_4002_RELEASE_IDS.filter((id) => !scripts[id] || !gateIds.has(id));
assertGate(missing.length === 0, '4.0.2 required scripts/gates missing', missing);
emitGate('sks:402-all-feature-regression', { required: REQUIRED_4002_RELEASE_IDS.length });

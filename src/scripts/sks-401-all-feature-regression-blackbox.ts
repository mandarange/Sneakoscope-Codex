import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';
import { REQUIRED_4001_RELEASE_IDS } from './release-4001-required-gates.js';
import fs from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as { scripts?: Record<string, string>; version?: string };
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8')) as { gates: Array<{ id: string }> };
const ids = new Set(manifest.gates.map((gate) => gate.id));
const missing = REQUIRED_4001_RELEASE_IDS.filter((id) => !pkg.scripts?.[id] || !ids.has(id));
assertGate(pkg.version === '4.0.1', 'package version must be 4.0.1', pkg.version);
assertGate(missing.length === 0, '4.0.1 required scripts/gates missing', missing);
emitGate('sks:401-all-feature-regression', { required: REQUIRED_4001_RELEASE_IDS.length });

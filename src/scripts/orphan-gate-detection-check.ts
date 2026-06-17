// @ts-nocheck
import { assertGate, emitGate, readJson } from './sks-1-18-gate-lib.js';

const pkg = readJson('package.json');
const scripts = pkg.scripts || {};
const gates = readJson('release-gates.v2.json').gates || [];
const missing = gates
  .map((gate) => ({ id: gate.id, script: String(gate.command || '').match(/^npm run ([^ ]+)/)?.[1] }))
  .filter((row) => row.script && !scripts[row.script]);
assertGate(missing.length === 0, 'release gates must not reference missing npm scripts', missing.slice(0, 20));
emitGate('orphan:gate-detection', { checked: gates.length });

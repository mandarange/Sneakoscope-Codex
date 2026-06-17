// @ts-nocheck
import { assertGate, emitGate, packageScripts, readText } from './sks-1-18-gate-lib.js';

const scripts = packageScripts();
const required = [
  'triwiki:proof-bank',
  'triwiki:affected-graph',
  'gate-pack:runner',
  'scheduler:extreme-parallel',
  'pipeline:five-minute-sla',
  'build-once:runner',
  'probes:memoization',
  'doctor:dirty-repair',
  'legacy:gate-inventory',
  'certificate:sla'
];
for (const id of required) assertGate(Boolean(scripts[id]), `4.0.0 script missing: ${id}`);
const changelog = readText('CHANGELOG.md');
assertGate(changelog.includes('[4.0.0]'), 'CHANGELOG must include 4.0.0 entry');
emitGate('sks:400-all-feature-regression', { scripts: required.length });

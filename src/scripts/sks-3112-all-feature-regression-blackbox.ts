#!/usr/bin/env node
import { assertGate, emitGate, exists, readJson } from './sks-1-18-gate-lib.js';

const scripts = readJson('package.json').scripts || {};
const required = [
  'release:gate-script-parity',
  'codex:0140-capability',
  'codex:0140-feature-probes',
  'doctor:fix-production-blackbox',
  'doctor:startup-config-repair-blackbox',
  'doctor:context7-mcp-repair-blackbox',
  'doctor:supabase-mcp-repair-blackbox',
  'native-capability:postcheck',
  'secret:preservation-guard',
  'secret:supabase-preservation-blackbox',
  'update:preserves-supabase-keys',
  'core-skill:no-drift',
  'skill:dedupe-blackbox',
  'release:dag-full-coverage'
];
for (const id of required) assertGate(Boolean(scripts[id]), `3.1.12 regression required script missing: ${id}`);
for (const file of [
  'src/core/doctor/doctor-transaction.ts',
  'src/core/codex-control/codex-0140-capability.ts',
  'src/core/config/secret-preservation.ts'
]) assertGate(exists(file), `3.1.12 regression required file missing: ${file}`);
emitGate('sks:3112-all-feature-regression', { scenarios: required.length });

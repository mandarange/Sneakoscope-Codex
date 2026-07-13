#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.js';

const mod = await importDist('core/release-parallel-full-coverage.js');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'release-gates.v2.json'), 'utf8'));
const current = (Array.isArray(manifest?.gates) ? manifest.gates : [])
  .filter((gate) => Array.isArray(gate?.preset) && gate.preset.includes('release'))
  .map((gate) => String(gate.id || ''))
  .filter(Boolean);
const report = mod.evaluateReleaseParallelFullCoverage(current);
assertGate(report.ok === true, 'manifest-backed release parallel DAG is missing trust-critical gates', report);
emitGate('release:parallel-full-coverage', {
  critical_gate_count: report.critical_gate_count,
  current_gate_count: report.current_gate_count,
  authoritative_source: report.authoritative_source
});

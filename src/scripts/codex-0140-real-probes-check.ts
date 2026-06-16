#!/usr/bin/env node
import { assertGate, emitGate, root } from './sks-1-18-gate-lib.js';
import { runCodex0140RealProbes } from '../core/codex-control/codex-0140-real-probes.js';

const requireReal = process.argv.includes('--require-real');
const allowNetwork = process.argv.includes('--allow-network');
const report = await runCodex0140RealProbes({ root, requireReal, allowNetwork });
assertGate(report.ok === true || !requireReal, requireReal ? 'codex:0140-real-probes:require-real failed' : 'optional Codex 0.140 real probes must skip instead of blocking release', report);
emitGate(requireReal ? 'codex:0140-real-probes:require-real' : 'codex:0140-real-probes', { probes: report.probes.length, skipped: report.probes.filter((probe) => probe.status === 'skipped').length });

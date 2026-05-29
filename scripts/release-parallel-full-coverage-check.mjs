#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist, packageScripts, root } from './sks-1-18-gate-lib.mjs';

const mod = await importDist('core/release-parallel-full-coverage.js');
const pkgScripts = packageScripts();
const parallelSource = fs.readFileSync(path.join(root, 'src/scripts/release-parallel-check.ts'), 'utf8');
const current = [...new Set(Object.keys(pkgScripts).filter((name) => parallelSource.includes(name)).concat(Object.keys(pkgScripts).filter((name) => /^xai-mcp|^source-intelligence|^codex-web|^goal-mode|^agent:main-no-scout|^agent:worker-scout-limited|^agent:background-terminals|^agent:zellij-runtime|^agent:visual-consistency|^release:parallel-full-coverage|^priority:full-closure/.test(name))))];
const report = mod.evaluateReleaseParallelFullCoverage(current);
assertGate(report.ok === true, 'release parallel DAG must preserve previous gates and include 1.18 gates', report);
emitGate('release:parallel-full-coverage', { previous_gate_count: report.previous_gate_count, current_gate_count: report.current_gate_count });

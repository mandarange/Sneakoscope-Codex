#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, requireContains, requirePackageScripts, runSksJson } from './sks-1-12-real-execution-check-lib.js';

const requiredScripts = [
  'ux-review:run-wires-imagegen',
  'ux-review:extract-wires-real-extractor',
  'ux-review:patch-diff-recheck',
  'ppt:real-export-adapter',
  'ppt:real-imagegen-wiring',
  'ppt:reexport-rereview',
  'dfix:patch-handoff',
  'dfix:verification-recommendation',
  'all-features:deep-completion',
  'evidence:flagship-coverage'
];

requirePackageScripts('all-features:deep-completion', requiredScripts);
requireContains('all-features:deep-completion', 'src/core/feature-registry.ts', [
  'command_registry',
  'evidence_router',
  'completion_proof',
  'trust_report',
  'wrongness',
  'blackbox',
  'mock_not_real',
  'unavailable_blocker'
]);

const report = runSksJson(['features', 'complete', '--json']);
assertGate(report.schema === 'sks.all-feature-completion.v1', 'all-feature completion schema mismatch', report);
assertGate(Array.isArray(report.features) && report.features.length > 0, 'all-feature completion rows missing', report);
emitGate('all-features:deep-completion', { version: report.version, features: report.features.length, status: report.status });

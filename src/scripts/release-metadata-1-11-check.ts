#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.js';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const requiredDocs = ['README.md', 'CHANGELOG.md', 'docs/release-readiness.md', 'docs/ux-review.md', 'docs/ppt-imagegen-review.md', 'docs/dfix.md'];
const requiredScripts = [
  'ux-review:generate-callouts-fixture',
  'ux-review:extract-real-callouts-fixture',
  'ux-review:patch-handoff-fixture',
  'ux-review:recapture-recheck-fixture',
  'ux-review:no-fake-callouts',
  'ppt:imagegen-review-fixture',
  'ppt:slide-export-fixture',
  'ppt:no-text-fallback',
  'ppt:no-mock-as-real',
  'ppt:issue-extraction-fixture',
  'ppt:image-voxel-relations',
  'ppt:proof-trust-fixture',
  'dfix:fixture',
  'dfix:verification',
  'all-features:completion',
  'json-schema:recursive-check'
];
assertGate(pkg.version === '1.11.0', 'package.json version must be 1.11.0', { version: pkg.version });
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
  if (['README.md', 'CHANGELOG.md', 'docs/release-readiness.md'].includes(file)) {
    assertGate(fs.readFileSync(absolute, 'utf8').includes('1.11.0'), `release doc does not mention 1.11.0: ${file}`);
  }
}
emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, docs: requiredDocs.length });

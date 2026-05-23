#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.mjs';

const RELEASE_VERSION = '1.15.1';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/release-readiness.md',
  'docs/mad-sks.md',
  'docs/mad-sks-rollback.md',
  'docs/permission-kernel.md',
  'docs/immutable-harness-guard.md',
  'docs/five-scout-pipeline.md',
  'docs/codex-cli-compat.md'
];
const requiredScripts = [
  'mad-sks:permission-model',
  'mad-sks:immutable-harness',
  'mad-sks:write-guard',
  'mad-sks:audit-proof',
  'mad-sks:no-harness-modification',
  'mad-sks:actual-executor',
  'mad-sks:file-write-executor',
  'mad-sks:shell-executor',
  'mad-sks:package-executor',
  'mad-sks:service-executor',
  'mad-sks:db-executor',
  'mad-sks:rollback-apply',
  'mad-sks:live-guard-smoke',
  'mad-sks:executor-proof-graph',
  'release:dist-freshness',
  'codex:exec-output-schema-actual-syntax',
  'scouts:engine-run-ux',
  'scouts:real-smoke',
  'flagship:proof-graph-v3',
  'flagship:proof-graph-v4'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
assertGate(lock.version === RELEASE_VERSION, `package-lock version must be ${RELEASE_VERSION}`, { version: lock.version });
assertGate(lock.packages?.['']?.version === RELEASE_VERSION, `package-lock root version must be ${RELEASE_VERSION}`, { version: lock.packages?.['']?.version });
assertGate(pkg.scripts?.['release:metadata']?.includes('release-metadata-1-15-check.mjs'), 'release:metadata must point to 1.15.1 check');
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of ['release:check', 'release:real-check', 'publish:dry', 'prepublishOnly']) {
  assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
}
assertGate(pkg.scripts['release:check'].startsWith('npm run build && npm run release:dist-freshness'), 'release:check must start with build and dist freshness');
for (const script of requiredScripts.filter((name) => name !== 'scouts:real-smoke')) {
  assertGate(pkg.scripts['release:check'].includes(script), `release:check missing ${script}`);
}
assertGate(pkg.scripts['release:real-check'].includes('scouts:real-smoke'), 'release:real-check missing scouts real smoke');
assertGate(pkg.scripts.prepublishOnly.includes('release:dist-freshness'), 'prepublishOnly missing dist freshness');
assertGate(pkg.scripts['publish:dry'].includes('release:dist-freshness'), 'publish:dry missing dist freshness');

for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
  assertGate(fs.readFileSync(absolute, 'utf8').includes(RELEASE_VERSION), `release doc does not mention ${RELEASE_VERSION}: ${file}`);
}

emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, docs: requiredDocs.length });

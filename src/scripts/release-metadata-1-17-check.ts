#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.js';

const RELEASE_VERSION = '1.17.0';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const parallelCheckPath = path.join(root, 'src/scripts/release-parallel-check.ts');
const parallelCheckSource = fs.existsSync(parallelCheckPath) ? fs.readFileSync(parallelCheckPath, 'utf8') : '';
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/typescript-runtime.md',
  'docs/no-runtime-mjs.md',
  'docs/agent-codex-app-cockpit.md',
  'docs/parallel-verification-engine.md',
  'docs/session-isolation.md',
  'docs/release-readiness.md'
];
const requiredScripts = [
  'runtime:no-src-mjs',
  'runtime:ts-source-of-truth',
  'runtime:dist-parity',
  'routes:proof-artifact-structure',
  'agent:codex-app-cockpit',
  'agent:janitor',
  'agent:multi-project-isolation',
  'verification:parallel-engine',
  'release:check:parallel'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
assertGate(lock.version === RELEASE_VERSION, `package-lock version must be ${RELEASE_VERSION}`, { version: lock.version });
assertGate(lock.packages?.['']?.version === RELEASE_VERSION, `package-lock root version must be ${RELEASE_VERSION}`, { version: lock.packages?.['']?.version });
assertGate(pkg.scripts?.['release:metadata']?.includes('release-metadata-1-17-check.mjs'), 'release:metadata must point to the 1.17 release check');
assertGate(String(pkg.scripts?.['release:check'] || '').startsWith('npm run release:check:parallel'), 'release:check must use release:check:parallel');
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of requiredScripts.filter((name) => name !== 'release:check:parallel')) {
  assertGate(parallelCheckSource.includes(`npm run ${script}`), `release:check:parallel DAG missing ${script}`);
}
assertGate(pkg.bin?.sks === 'dist/bin/sks.js', 'package runtime must use dist/bin/sks.js');
assertGate(pkg.bin?.sneakoscope === 'dist/bin/sks.js', 'sneakoscope runtime must use dist/bin/sks.js');
assertGate(!pkg.files?.includes('src'), 'package files must not include src runtime shadows');

for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
  assertGate(fs.readFileSync(absolute, 'utf8').includes(RELEASE_VERSION), `release doc does not mention ${RELEASE_VERSION}: ${file}`);
}

emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, docs: requiredDocs.length });

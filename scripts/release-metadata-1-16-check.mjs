#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.mjs';

const RELEASE_VERSION = '1.16.2';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/release-readiness.md',
  'docs/native-agent-kernel.md',
  'docs/native-agent-engines.md',
  'docs/native-agent-orchestration.md',
  'docs/agent-non-recursive-pipeline.md',
  'docs/agent-central-ledger.md',
  'docs/work-partition-and-leases.md',
  'docs/team-mode.md',
  'docs/research-mode.md',
  'docs/native-agent-orchestration.md'
];
const requiredScripts = [
  'agent:non-recursive-pipeline',
  'agent:non-recursive-pipeline-report',
  'agent:legacy-multiagent-removed',
  'agent:central-ledger',
  'agent:work-partition',
  'agent:no-overlap-proof',
  'agent:persona-uniqueness',
  'agent:max-cap',
  'agent:fake-backend-blackbox',
  'agent:lifecycle-close',
  'agent:output-schema',
  'agent:lease-conflicts',
  'agent:proof-graph',
  'team:native-agent-backend',
  'research:native-agent-backend',
  'qa:native-agent-backend',
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
  'flagship:proof-graph-v3',
  'flagship:proof-graph-v4'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
assertGate(lock.version === RELEASE_VERSION, `package-lock version must be ${RELEASE_VERSION}`, { version: lock.version });
assertGate(lock.packages?.['']?.version === RELEASE_VERSION, `package-lock root version must be ${RELEASE_VERSION}`, { version: lock.packages?.['']?.version });
assertGate(pkg.scripts?.['release:metadata']?.includes('release-metadata-1-16-check.mjs'), 'release:metadata must point to the 1.16 release check');
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of ['release:check', 'release:real-check', 'publish:dry', 'prepublishOnly']) {
  assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
}
assertGate(pkg.scripts['release:check'].startsWith('npm run build && npm run release:dist-freshness'), 'release:check must start with build and dist freshness');
for (const script of requiredScripts) {
  assertGate(pkg.scripts['release:check'].includes(script), `release:check missing ${script}`);
}
assertGate(!/\bscouts?:/.test(pkg.scripts['release:real-check'] || ''), 'release:real-check must not require legacy multi-agent checks');
assertGate(pkg.scripts.prepublishOnly.includes('release:dist-freshness'), 'prepublishOnly missing dist freshness');
assertGate(pkg.scripts['publish:dry'].includes('release:dist-freshness'), 'publish:dry missing dist freshness');

for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
  assertGate(fs.readFileSync(absolute, 'utf8').includes(RELEASE_VERSION), `release doc does not mention ${RELEASE_VERSION}: ${file}`);
}

emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, docs: requiredDocs.length });

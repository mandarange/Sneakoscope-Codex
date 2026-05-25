#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.mjs';

const RELEASE_VERSION = '1.18.2';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const parallelCheckPath = path.join(root, 'scripts/release-parallel-check.mjs');
const parallelCheckSource = fs.existsSync(parallelCheckPath) ? fs.readFileSync(parallelCheckPath, 'utf8') : '';
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/source-intelligence-layer.md',
  'docs/xai-context7-codex-web-policy.md',
  'docs/main-no-scout-worker-scout-policy.md',
  'docs/agent-terminal-lanes.md',
  'docs/tmux-right-lane-cockpit.md',
  'docs/codex-official-goal-mode.md',
  'docs/dynamic-agent-pool.md',
  'docs/work-queue-expansion.md',
  'docs/follow-up-work-items.md',
  'docs/tmux-lane-persistence.md',
  'docs/scheduler-proof-gates.md',
  'docs/agent-backfill-blackboxes.md',
  'docs/session-generation.md',
  'docs/tmux-right-lane-runtime.md',
  'docs/release-parallel-full-coverage.md',
  'docs/priority-closure-p0-p4.md',
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
  'xai-mcp:capability',
  'source-intelligence:policy',
  'source-intelligence:all-modes',
  'codex-web:adapter',
  'goal-mode:official-default',
  'agent:main-no-scout',
  'agent:worker-scout-limited',
  'agent:background-terminals',
  'agent:tmux-right-lanes',
  'agent:task-graph-expansion',
  'agent:follow-up-work-schema',
  'agent:dynamic-pool-route-blackbox',
  'agent:backfill-route-blackbox',
  'team:backfill-route-blackbox',
  'research:backfill-route-blackbox',
  'qa:backfill-route-blackbox',
  'agent:tmux-lane-persistence',
  'agent:tmux-lane-no-flicker',
  'agent:scheduler-proof-hardening',
  'agent:dynamic-pool',
  'agent:backfill-replenishment',
  'agent:scheduler-proof',
  'agent:session-generation',
  'agent:terminal-generations',
  'agent:tmux-real-right-lanes',
  'agent:dynamic-cockpit',
  'agent:source-intelligence-propagation',
  'agent:goal-mode-propagation',
  'agent:visual-consistency',
  'release:parallel-full-coverage',
  'priority:full-closure',
  'release:native-agent-backend',
  'all-features:completion',
  'all-features:deep-completion',
  'json-schema:recursive-check',
  'evidence:flagship-coverage',
  'ux-review:run-wires-imagegen',
  'ppt:imagegen-review-fixture',
  'ppt:full-e2e-blackbox',
  'dfix:fixture',
  'hooks:strict-subset-check',
  'hooks:trust-warning-zero',
  'codex-lb:setup-truthfulness',
  'computer-use:visual-route-fixture',
  'mad-sks:executor-proof-graph',
  'blackbox:matrix:contract',
  'test:blackbox',
  'rust:check',
  'perf:gate',
  'release:check:parallel'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
assertGate(lock.version === RELEASE_VERSION, `package-lock version must be ${RELEASE_VERSION}`, { version: lock.version });
assertGate(lock.packages?.['']?.version === RELEASE_VERSION, `package-lock root version must be ${RELEASE_VERSION}`, { version: lock.packages?.['']?.version });
assertGate(pkg.scripts?.['release:metadata']?.includes('release-metadata-1-18-check.mjs'), 'release:metadata must point to the 1.18 release check');
assertGate(String(pkg.scripts?.['release:check'] || '').startsWith('npm run release:check:parallel'), 'release:check must use release:check:parallel');
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of requiredScripts.filter((name) => name !== 'release:check:parallel')) {
  assertGate(parallelCheckSource.includes(`npm run ${script}`) || ['release:metadata', 'release:readiness'].includes(script), `release:check:parallel DAG missing ${script}`);
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

#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.mjs';

const RELEASE_VERSION = '1.18.8';
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const distManifestPath = path.join(root, 'dist/build-manifest.json');
const distManifest = fs.existsSync(distManifestPath) ? JSON.parse(fs.readFileSync(distManifestPath, 'utf8')) : null;
const parallelCheckPath = path.join(root, 'src/scripts/release-parallel-check.ts');
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
  'docs/real-tmux-pane-proof.md',
  'docs/real-codex-dynamic-smoke.md',
  'docs/agent-cleanup-executor.md',
  'docs/intelligent-work-graph.md',
  'docs/fake-vs-real-proof-policy.md',
  'docs/runtime-truth-matrix.md',
  'docs/warp-mad-tmux-lanes.md',
  'docs/adhd-orchestrating-gate.md',
  'docs/strategy-first-parallel-write.md',
  'docs/appshots-pipeline.md',
  'docs/codex-0.134-compat.md',
  'docs/parallel-write-agents.md',
  'docs/agent-patch-queue.md',
  'docs/migration-1.18.7-to-1.18.8.md',
  'docs/release-parallel-full-coverage.md',
  'docs/priority-closure-p0-p4.md',
  'docs/release-readiness.md'
];
const versionedDocs = new Set([
  'README.md',
  'CHANGELOG.md',
  'docs/migration-1.18.7-to-1.18.8.md',
  'docs/runtime-truth-matrix.md',
  'docs/release-readiness.md'
]);
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
  'agent:cli-options-to-task-graph',
  'agent:route-truth-backfill',
  'team:backfill-route-blackbox',
  'team:actual-route-backfill',
  'research:backfill-route-blackbox',
  'research:actual-route-backfill',
  'qa:backfill-route-blackbox',
  'qa:actual-route-backfill',
  'agent:tmux-lane-persistence',
  'agent:tmux-lane-no-flicker',
  'agent:tmux-supervisor-integrated',
  'agent:tmux-slot-lane-runtime',
  'agent:proof-contract-reconciled',
  'agent:scheduler-proof-hardening',
  'agent:dynamic-pool',
  'agent:backfill-replenishment',
  'agent:scheduler-proof',
  'agent:session-generation',
  'agent:terminal-generations',
  'agent:tmux-real-right-lanes',
  'agent:tmux-physical-lifecycle-wired',
  'agent:tmux-physical-proof-v2',
  'agent:cleanup-executor',
  'agent:cleanup-executor-v2',
  'agent:cleanup-command-ux',
  'retention:cleanup-safety',
  'agent:intelligent-work-graph',
  'agent:ast-aware-work-graph',
  'proof:fake-vs-real-policy',
  'proof:fake-real-policy-v2',
  'release:runtime-truth-matrix',
  'release:gate-existence-audit',
  'codex:0.134-compat',
  'codex:0.134-official-compat',
  'codex:profile-primary',
  'codex:managed-proxy-env',
  'strategy:adhd-orchestrating-gate',
  'strategy:parallel-modification-plan',
  'strategy:file-ownership-plan',
  'strategy:verification-rollback-dag',
  'appshots:capability',
  'appshots:operator-policy',
  'appshots:evidence',
  'appshots:source-intelligence',
  'appshots:triwiki-voxel',
  'appshots:privacy-safety',
  'mcp:0.134-modernization',
  'mcp:readonly-concurrency',
  'hooks:0.134-context-parity',
  'source-intelligence:codex-history-search',
  'agent:parallel-write-kernel',
  'agent:parallel-write-blackbox',
  'team:parallel-write-blackbox',
  'dfix:parallel-write-blackbox',
  'agent:patch-proof',
  'agent:patch-rollback',
  'route:blackbox-realism',
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
const requiredRealScripts = [
  'agent:real-tmux-physical-proof',
  'agent:tmux-physical-lifecycle-wired',
  'agent:tmux-physical-proof-v2',
  'agent:tmux-pane-reconciliation',
  'agent:tmux-lane-content-truth',
  'agent:real-codex-dynamic-smoke-v2',
  'agent:real-codex-dynamic-smoke'
];

assertGate(pkg.version === RELEASE_VERSION, `package.json version must be ${RELEASE_VERSION}`, { version: pkg.version });
assertGate(lock.version === RELEASE_VERSION, `package-lock version must be ${RELEASE_VERSION}`, { version: lock.version });
assertGate(lock.packages?.['']?.version === RELEASE_VERSION, `package-lock root version must be ${RELEASE_VERSION}`, { version: lock.packages?.['']?.version });
assertVersionSurface('src/core/version.ts', `PACKAGE_VERSION = '${RELEASE_VERSION}'`);
assertVersionSurface('src/core/fsx.ts', `PACKAGE_VERSION = '${RELEASE_VERSION}'`);
assertVersionSurface('src/bin/sks.ts', `FAST_PACKAGE_VERSION = '${RELEASE_VERSION}'`);
assertVersionSurface('crates/sks-core/Cargo.toml', `version = "${RELEASE_VERSION}"`);
assertVersionSurface('crates/sks-core/Cargo.lock', `version = "${RELEASE_VERSION}"`);
assertVersionSurface('crates/sks-core/src/main.rs', `sks-rs ${RELEASE_VERSION}`);
assertGate(distManifest?.version === RELEASE_VERSION, `dist/build-manifest version must be ${RELEASE_VERSION}`, { version: distManifest?.version || null });
assertGate(distManifest?.package_version === RELEASE_VERSION, `dist/build-manifest package_version must be ${RELEASE_VERSION}`, { package_version: distManifest?.package_version || null });
assertGate(typeof distManifest?.source_digest === 'string' && distManifest.source_digest.length >= 32, 'dist/build-manifest must include source_digest', { source_digest: distManifest?.source_digest || null });
assertGate(pkg.scripts?.['release:metadata']?.includes('release-metadata-1-18-check.mjs'), 'release:metadata must point to the 1.18 release check');
assertGate(String(pkg.scripts?.['release:check'] || '').startsWith('npm run release:check:parallel'), 'release:check must use release:check:parallel');
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of requiredRealScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package real script: ${script}`);
for (const script of requiredScripts.filter((name) => name !== 'release:check:parallel')) {
  assertGate(parallelCheckSource.includes(`npm run ${script}`) || ['release:metadata', 'release:readiness'].includes(script), `release:check:parallel DAG missing ${script}`);
}
for (const script of requiredRealScripts) {
  assertGate(String(pkg.scripts?.['release:real-check'] || '').includes(`npm run ${script}`), `release:real-check missing ${script}`);
}
assertGate(pkg.bin?.sks === 'dist/bin/sks.js', 'package runtime must use dist/bin/sks.js');
assertGate(pkg.bin?.sneakoscope === 'dist/bin/sks.js', 'sneakoscope runtime must use dist/bin/sks.js');
assertGate(!pkg.files?.includes('src'), 'package files must not include src runtime shadows');

for (const file of requiredDocs) {
  const absolute = path.join(root, file);
  assertGate(fs.existsSync(absolute), `missing release doc: ${file}`);
  if (versionedDocs.has(file)) {
    assertGate(fs.readFileSync(absolute, 'utf8').includes(RELEASE_VERSION), `release doc does not mention ${RELEASE_VERSION}: ${file}`);
  }
}

const report = {
  schema: 'sks.version-metadata-1.18.v1',
  version: RELEASE_VERSION,
  package_version: pkg.version,
  version_surfaces: [
    'package.json',
    'package-lock.json',
    'src/core/version.ts',
    'src/core/fsx.ts',
    'src/bin/sks.ts',
    'crates/sks-core/Cargo.toml',
    'crates/sks-core/Cargo.lock',
    'crates/sks-core/src/main.rs',
    'dist/build-manifest.json'
  ],
  dist_build_manifest: {
    version: distManifest?.version || null,
    package_version: distManifest?.package_version || null,
    source_digest: distManifest?.source_digest || null,
    source_file_count: distManifest?.source_file_count || null
  },
  scripts: requiredScripts,
  real_scripts: requiredRealScripts,
  docs: requiredDocs,
  generated_at: new Date().toISOString(),
  ok: true
};
const out = path.join(root, '.sneakoscope', 'reports', `version-metadata-${RELEASE_VERSION}.json`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

emitGate('release:metadata', { version: pkg.version, scripts: requiredScripts.length, real_scripts: requiredRealScripts.length, docs: requiredDocs.length });

function assertVersionSurface(relFile, needle) {
  const absolute = path.join(root, relFile);
  assertGate(fs.existsSync(absolute), `missing version surface: ${relFile}`);
  const text = fs.readFileSync(absolute, 'utf8');
  assertGate(text.includes(needle), `${relFile} must contain ${needle}`, { file: relFile, needle });
}

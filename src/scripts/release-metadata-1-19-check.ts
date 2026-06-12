#!/usr/bin/env node
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, root } from './sks-1-11-gate-lib.js';

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const RELEASE_VERSION = String(pkg.version || '');
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
const distManifestPath = path.join(root, 'dist/build-manifest.json');
const distManifest = fs.existsSync(distManifestPath) ? JSON.parse(fs.readFileSync(distManifestPath, 'utf8')) : null;
const parallelCheckPath = path.join(root, 'src/scripts/release-parallel-check.ts');
const parallelCheckSource = fs.existsSync(parallelCheckPath) ? fs.readFileSync(parallelCheckPath, 'utf8') : '';
const releaseCheckScriptSource = [
  String(pkg.scripts?.['release:check'] || ''),
  String(pkg.scripts?.['release:check:legacy'] || ''),
  parallelCheckSource
].join('\n');
const releaseRealCheckPath = path.join(root, 'src/scripts/release-real-check.ts');
const releaseRealCheckSource = fs.existsSync(releaseRealCheckPath) ? fs.readFileSync(releaseRealCheckPath, 'utf8') : '';
const requiredDocs = [
  'README.md',
  'CHANGELOG.md',
  'docs/source-intelligence-layer.md',
  'docs/xai-context7-codex-web-policy.md',
  'docs/main-no-scout-worker-scout-policy.md',
  'docs/agent-terminal-lanes.md',
  'docs/migration/tmux-to-zellij.md',
  'docs/codex-0.139-compat.md',
  'docs/codex-0.136-compat.md',
  'docs/codex-0.135-compat.md',
  'docs/triwiki-runtime-state.md',
  'docs/codex-official-goal-mode.md',
  'docs/dynamic-agent-pool.md',
  'docs/work-queue-expansion.md',
  'docs/follow-up-work-items.md',
  'docs/scheduler-proof-gates.md',
  'docs/agent-backfill-blackboxes.md',
  'docs/session-generation.md',
  'docs/real-codex-dynamic-smoke.md',
  'docs/agent-cleanup-executor.md',
  'docs/intelligent-work-graph.md',
  'docs/fake-vs-real-proof-policy.md',
  'docs/runtime-truth-matrix.md',
  'docs/adhd-orchestrating-gate.md',
  'docs/strategy-first-parallel-write.md',
  'docs/appshots-pipeline.md',
  'docs/codex-0.134-compat.md',
  'docs/parallel-write-agents.md',
  'docs/agent-patch-queue.md',
  'docs/patch-swarm-runtime.md',
  'docs/patch-conflict-rebase.md',
  'docs/real-codex-patch-smoke.md',
  'docs/patch-transaction-journal.md',
  'docs/strategy-to-patch-wiring.md',
  'docs/parallel-write-agent-runtime.md',
  'docs/patch-proof-and-rollback.md',
  'docs/appshots-thread-attachments.md',
  'docs/mcp-readonly-runtime-scheduler.md',
  'docs/mcp-readonly-scheduler.md',
  'docs/native-cli-session-swarm.md',
  'docs/no-subagent-scaling.md',
  'docs/fast-mode-default.md',
  'docs/real-codex-parallel-workers.md',
  'docs/native-worker-backend-router.md',
  'docs/real-codex-patch-envelope-contract.md',
  'docs/codex-config-eperm-self-heal.md',
  'docs/doctor-real-fix.md',
  'docs/mad-launch-preflight.md',
  'docs/fast-mode-official-service-tier.md',
  'docs/codex-project-config-policy.md',
  'docs/macos-tcc-operator-actions.md',
  'docs/migration-1.18.7-to-1.18.8.md',
  'docs/release-parallel-full-coverage.md',
  'docs/priority-closure-p0-p4.md',
  'docs/release-readiness.md',
  'docs/release-proof-truth.md',
  'docs/legacy-upgrade-1.19.md',
  'docs/architecture-ts-rust-boundary.md',
  'docs/zellij-ui-design.md',
  'docs/core-skill-engine.md',
  'docs/side-effect-zero-policy.md',
  'docs/legacy-upgrade-1.20.md'
];
const versionedDocs = new Set([
  'README.md',
  'CHANGELOG.md',
  'docs/codex-0.139-compat.md',
  'docs/release-readiness.md',
  'docs/release-proof-truth.md'
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
  'agent:zellij-runtime',
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
  'zellij:layout-valid',
  'zellij:lane-renderer',
  'zellij:pane-proof',
  'zellij:screen-proof',
  'agent:proof-contract-reconciled',
  'agent:scheduler-proof-hardening',
  'agent:dynamic-pool',
  'agent:backfill-replenishment',
  'agent:scheduler-proof',
  'agent:session-generation',
  'agent:terminal-generations',
  'agent:zellij-runtime',
  'zellij:pane-proof',
  'zellij:screen-proof',
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
  'codex:0.136-compat',
  'codex:0.135-compat',
  'doctor:codex-doctor-parity',
  'codex:permission-profiles',
  'codex:legacy-profile-consumers-removed',
  'terminal:keyboard-enhancement-safety',
  'terminal:tui-output-stability',
  'codex:resume-cwd-truth',
  'mcp:tool-naming-parity',
  'responses:retry-policy-centralized',
  'runtime:no-tmux',
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
  'agent:patch-envelope-extraction',
  'agent:patch-queue-runtime',
  'agent:strategy-to-lease-wiring',
  'agent:patch-swarm-runtime',
  'agent:patch-swarm-runtime-truth',
  'agent:patch-transaction-journal',
  'agent:patch-conflict-rebase',
  'agent:strategy-to-patch-strict',
  'agent:rollback-command',
  'agent:patch-verification-dag',
  'agent:patch-rollback-dag',
  'agent:patch-proof-runtime',
  'agent:patch-swarm-route-blackbox',
  'team:patch-swarm-route-blackbox',
  'dfix:patch-swarm-route-blackbox',
  'agent:patch-proof',
  'agent:patch-rollback',
  'appshots:thread-attachment-discovery',
  'mcp:readonly-runtime-scheduler',
  'agent:real-codex-patch-envelope-smoke',
  'codex:0.134-runner-truth',
  'agent:native-cli-session-swarm',
  'naruto:shadow-clone-swarm',
  'doctor:fix-recovers-corrupted-config',
  'install:update-preserves-config',
  'codex-lb:config-toml-safety',
  'codex-app:ui-preservation',
  'codex-app:fast-ui-preservation',
  'codex-app:ui-clobber-guard',
  'doctor:fixes-codex-app-fast-ui',
  'provider:badge-context',
  'codex-app:provider-badge',
  'zellij:launch-command-truth',
  'zellij:spawn-on-demand-layout',
  'zellij:worker-pane-manager',
  'agent:worker-pane-communication-contract',
  'zellij:real-session-heartbeat',
  'zellij:ui-design',
  'legacy:upgrade-zero-break',
  'publish:packlist-performance',
  'postinstall:safe-side-effects',
  'runtime:ts-rust-boundary',
  'runtime:no-mjs-scripts',
  'runtime:ts-python-boundary',
  'core-skill:card-schema',
  'core-skill:rollout-scoring',
  'core-skill:patch',
  'core-skill:heldout-validation',
  'core-skill:deployment-snapshot',
  'core-skill:no-inference-optimizer',
  'core-skill:route-runtime-integration',
  'core-skill:promotion-side-effect-ledger',
  'core-skill:legacy-promotion-api-audit',
  'core-skill:trainer-loop',
  'safety:side-effect-zero',
  'safety:mutation-callsite-coverage',
  'safety:mutation-callsite-coverage:repo-wide',
  'side-effect:runtime-report',
  'release:version-truth',
  'zellij:doctor-readiness',
  'release:gate-planner',
  'release:dynamic-performance',
  'release:provenance',
  'release:gate-budget',
  'agent:wiki-context-proof',
  'shared-memory:check',
  'wrongness:check',
  'wrongness:fixtures',
  'trust:check',
  'git-collaboration:e2e',
  'agent:native-cli-session-swarm-10',
  'agent:native-cli-session-swarm-20',
  'agent:no-subagent-scaling',
  'agent:native-cli-session-proof',
  'agent:worker-backend-router',
  'agent:codex-child-overlap',
  'agent:model-authored-patch-envelope',
  'runtime:no-tmux',
  'mad-sks:zellij-launch',
  'agent:fast-mode-default',
  'agent:fast-mode-worker-propagation',
  'codex:fast-mode-profile-propagation',
  'mad-sks:fast-mode-propagation',
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
  'codex:0.136-compat:require-real',
  'codex:0.135-compat:require-real',
  'doctor:codex-doctor-parity:actual',
  'publish:dry-run-performance',
  'zellij:capability',
  'zellij:pane-proof',
  'zellij:screen-proof',
  'agent:real-codex-dynamic-smoke-v2',
  'agent:real-codex-dynamic-smoke',
  'agent:real-codex-patch-envelope-smoke',
  'agent:real-codex-parallel-workers',
  'agent:real-codex-parallel-workers-5',
  'agent:real-codex-parallel-workers-10',
  'agent:real-codex-parallel-workers-20'
];

assertGate(/^\d+\.\d+\.\d+$/.test(RELEASE_VERSION), 'package.json version must be a stable semver', { version: pkg.version });
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
assertGate(pkg.scripts?.['release:metadata']?.includes('dist/scripts/release-metadata-check.js'), 'release:metadata must point to the generic release metadata check');
const releaseCheckScript = String(pkg.scripts?.['release:check'] || '');
assertGate(
  releaseCheckScript.startsWith('npm run release:check:parallel')
    || releaseCheckScript.includes('release-gate-dag-runner.js --preset release')
    || releaseCheckScript.includes('release:check:affected'),
  'release:check must use release:check:parallel, release:check:affected, or the release gate DAG runner'
);
for (const script of requiredScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package script: ${script}`);
for (const script of requiredRealScripts) assertGate(Boolean(pkg.scripts?.[script]), `missing package real script: ${script}`);
for (const script of requiredScripts.filter((name) => name !== 'release:check:parallel')) {
  assertGate(releaseCheckScriptSource.includes(`npm run ${script}`) || ['release:metadata', 'release:readiness'].includes(script), `release check coverage missing ${script}`);
}
for (const script of requiredRealScripts) {
  assertGate(
    String(pkg.scripts?.['release:real-check'] || '').includes(`npm run ${script}`) || releaseRealCheckSource.includes(`'${script}'`) || releaseRealCheckSource.includes(`"${script}"`),
    `release:real-check missing ${script}`
  );
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
  schema: 'sks.version-metadata-1.19.v1',
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

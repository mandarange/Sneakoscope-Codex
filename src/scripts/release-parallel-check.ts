#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerificationDag, type VerificationDag } from '../core/verification/verification-dag.js';
import { writeParallelVerificationProof } from '../core/verification/verification-proof.js';
import { runVerificationDag } from '../core/verification/verification-worker-pool.js';
import type { ParallelVerificationResult, VerificationTask } from '../core/verification/verification-result.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const logDir = path.join(reportDir, 'release-parallel-logs');
fs.mkdirSync(logDir, { recursive: true });

type ReleaseTaskExtra = Partial<Pick<VerificationTask, 'cwd' | 'dependencies' | 'env' | 'inputs' | 'outputs' | 'read_only' | 'timeout_ms'>>;

const deterministicReleaseEnv: Record<string, string> = {
  SKS_TEST_REAL_TMUX: '0',
  SKS_REQUIRE_REAL_TMUX: '0',
  SKS_TEST_REAL_DYNAMIC_AGENTS: '0',
  SKS_REQUIRE_REAL_DYNAMIC_AGENTS: '0',
  SKS_TEST_REAL_IMAGEGEN: '0',
  SKS_REAL_IMAGEGEN: '0',
  SKS_CODEX_APP_IMAGEGEN: '0',
  SKS_REQUIRE_REAL_COMPUTER_USE: '0'
};

const tasks: VerificationTask[] = [
  task('build', 'npm run build --silent', { outputs: ['dist'] }),
  task('runtime:no-src-mjs', 'npm run runtime:no-src-mjs --silent', { dependencies: ['build'] }),
  task('runtime:ts-source-of-truth', 'npm run runtime:ts-source-of-truth --silent', { dependencies: ['build'] }),
  task('runtime:dist-parity', 'npm run runtime:dist-parity --silent', { dependencies: ['build', 'runtime:no-src-mjs'] }),
  task('routes:proof-artifact-structure', 'npm run routes:proof-artifact-structure --silent', { dependencies: ['build'] }),
  task('agent:codex-app-cockpit', 'npm run agent:codex-app-cockpit --silent', { dependencies: ['build'] }),
  task('agent:janitor', 'npm run agent:janitor --silent', { dependencies: ['build'] }),
  task('agent:multi-project-isolation', 'npm run agent:multi-project-isolation --silent', { dependencies: ['build'] }),
  task('verification:parallel-engine', 'npm run verification:parallel-engine --silent', { dependencies: ['build'] }),
  task('xai-mcp:capability', 'npm run xai-mcp:capability --silent', { dependencies: ['build'] }),
  task('source-intelligence:policy', 'npm run source-intelligence:policy --silent', { dependencies: ['build'] }),
  task('source-intelligence:all-modes', 'npm run source-intelligence:all-modes --silent', { dependencies: ['build', 'source-intelligence:policy', 'xai-mcp:capability', 'codex-web:adapter'] }),
  task('codex-web:adapter', 'npm run codex-web:adapter --silent', { dependencies: ['build'] }),
  task('goal-mode:official-default', 'npm run goal-mode:official-default --silent', { dependencies: ['build'] }),
  task('agent:main-no-scout', 'npm run agent:main-no-scout --silent', { dependencies: ['build'] }),
  task('agent:worker-scout-limited', 'npm run agent:worker-scout-limited --silent', { dependencies: ['build'] }),
  task('agent:background-terminals', 'npm run agent:background-terminals --silent', { dependencies: ['build'] }),
  task('agent:tmux-right-lanes', 'npm run agent:tmux-right-lanes --silent', { dependencies: ['build'] }),
  task('agent:task-graph-expansion', 'npm run agent:task-graph-expansion --silent', { dependencies: ['build'] }),
  task('agent:follow-up-work-schema', 'npm run agent:follow-up-work-schema --silent', { dependencies: ['build'] }),
  task('agent:dynamic-pool-route-blackbox', 'npm run agent:dynamic-pool-route-blackbox --silent', { dependencies: ['build'] }),
  task('agent:backfill-route-blackbox', 'npm run agent:backfill-route-blackbox --silent', { dependencies: ['build'] }),
  task('agent:cli-options-to-task-graph', 'npm run agent:cli-options-to-task-graph --silent', { dependencies: ['build'] }),
  task('agent:route-truth-backfill', 'npm run agent:route-truth-backfill --silent', { dependencies: ['build'] }),
  task('team:backfill-route-blackbox', 'npm run team:backfill-route-blackbox --silent', { dependencies: ['build'] }),
  task('team:actual-route-backfill', 'npm run team:actual-route-backfill --silent', { dependencies: ['build'] }),
  task('research:backfill-route-blackbox', 'npm run research:backfill-route-blackbox --silent', { dependencies: ['build'] }),
  task('research:actual-route-backfill', 'npm run research:actual-route-backfill --silent', { dependencies: ['build'] }),
  task('qa:backfill-route-blackbox', 'npm run qa:backfill-route-blackbox --silent', { dependencies: ['build'] }),
  task('qa:actual-route-backfill', 'npm run qa:actual-route-backfill --silent', { dependencies: ['build'] }),
  task('agent:tmux-lane-persistence', 'npm run agent:tmux-lane-persistence --silent', { dependencies: ['build'] }),
  task('agent:tmux-lane-no-flicker', 'npm run agent:tmux-lane-no-flicker --silent', { dependencies: ['build'] }),
  task('agent:tmux-supervisor-integrated', 'npm run agent:tmux-supervisor-integrated --silent', { dependencies: ['build'] }),
  task('agent:tmux-slot-lane-runtime', 'npm run agent:tmux-slot-lane-runtime --silent', { dependencies: ['build'] }),
  task('agent:proof-contract-reconciled', 'npm run agent:proof-contract-reconciled --silent', { dependencies: ['build'] }),
  task('agent:scheduler-proof-hardening', 'npm run agent:scheduler-proof-hardening --silent', { dependencies: ['build'] }),
  task('agent:dynamic-pool', 'npm run agent:dynamic-pool --silent', { dependencies: ['build'] }),
  task('agent:backfill-replenishment', 'npm run agent:backfill-replenishment --silent', { dependencies: ['build'] }),
  task('agent:scheduler-proof', 'npm run agent:scheduler-proof --silent', { dependencies: ['build'] }),
  task('agent:session-generation', 'npm run agent:session-generation --silent', { dependencies: ['build'] }),
  task('agent:terminal-generations', 'npm run agent:terminal-generations --silent', { dependencies: ['build'] }),
  task('agent:tmux-real-right-lanes', 'npm run agent:tmux-real-right-lanes --silent', { dependencies: ['build'] }),
  task('agent:tmux-physical-lifecycle-wired', 'npm run agent:tmux-physical-lifecycle-wired --silent', { dependencies: ['build'] }),
  task('agent:tmux-physical-proof-v2', 'npm run agent:tmux-physical-proof-v2 --silent', { dependencies: ['build'] }),
  task('agent:cleanup-executor', 'npm run agent:cleanup-executor --silent', { dependencies: ['build'] }),
  task('agent:cleanup-executor-v2', 'npm run agent:cleanup-executor-v2 --silent', { dependencies: ['build'] }),
  task('agent:cleanup-command-ux', 'npm run agent:cleanup-command-ux --silent', { dependencies: ['build'] }),
  task('agent:intelligent-work-graph', 'npm run agent:intelligent-work-graph --silent', { dependencies: ['build'] }),
  task('agent:ast-aware-work-graph', 'npm run agent:ast-aware-work-graph --silent', { dependencies: ['build'] }),
  task('proof:fake-vs-real-policy', 'npm run proof:fake-vs-real-policy --silent', { dependencies: ['build'] }),
  task('proof:fake-real-policy-v2', 'npm run proof:fake-real-policy-v2 --silent', { dependencies: ['build'] }),
  task('release:runtime-truth-matrix', 'npm run release:runtime-truth-matrix --silent', { dependencies: ['agent:tmux-physical-proof-v2', 'agent:cleanup-executor-v2', 'agent:ast-aware-work-graph', 'proof:fake-real-policy-v2'] }),
  task('route:blackbox-realism', 'npm run route:blackbox-realism --silent', { dependencies: ['build'] }),
  task('agent:dynamic-cockpit', 'npm run agent:dynamic-cockpit --silent', { dependencies: ['build'] }),
  task('agent:source-intelligence-propagation', 'npm run agent:source-intelligence-propagation --silent', { dependencies: ['build'] }),
  task('agent:goal-mode-propagation', 'npm run agent:goal-mode-propagation --silent', { dependencies: ['build'] }),
  task('agent:visual-consistency', 'npm run agent:visual-consistency --silent', { dependencies: ['build'] }),
  task('release:parallel-full-coverage', 'npm run release:parallel-full-coverage --silent', { dependencies: ['build'] }),
  task('priority:full-closure', 'npm run priority:full-closure --silent', { dependencies: ['build'] }),
  task('release:native-agent-backend', 'npm run release:native-agent-backend --silent', { dependencies: ['build'] }),
  task('agent:legacy-multiagent-removed', 'npm run agent:legacy-multiagent-removed --silent', { dependencies: ['build'] }),
  task('all-features:completion', 'npm run all-features:completion --silent', { dependencies: ['build'] }),
  task('all-features:deep-completion', 'npm run all-features:deep-completion --silent', { dependencies: ['build'] }),
  task('json-schema:recursive-check', 'npm run json-schema:recursive-check --silent', { dependencies: ['build'] }),
  task('evidence:flagship-coverage', 'npm run evidence:flagship-coverage --silent', { dependencies: ['build'] }),
  task('image-fidelity:check', 'npm run image-fidelity:check --silent', { dependencies: ['build'] }),
  task('imagegen:capability', 'npm run imagegen:capability --silent', { dependencies: ['build'] }),
  task('imagegen:gpt-image-2-request-validator', 'npm run imagegen:gpt-image-2-request-validator --silent', { dependencies: ['build'] }),
  task('ux-review:run-wires-imagegen', 'npm run ux-review:run-wires-imagegen --silent', { dependencies: ['build'] }),
  task('ux-review:extract-wires-real-extractor', 'npm run ux-review:extract-wires-real-extractor --silent', { dependencies: ['build'] }),
  task('ux-review:patch-diff-recheck', 'npm run ux-review:patch-diff-recheck --silent', { dependencies: ['build'] }),
  task('ux-review:imagegen-blackbox', 'npm run ux-review:imagegen-blackbox --silent', { dependencies: ['build'] }),
  task('ux-review:real-loop-fixture', 'npm run ux-review:real-loop-fixture --silent', { dependencies: ['build'] }),
  task('ux-review:generate-callouts-fixture', 'npm run ux-review:generate-callouts-fixture --silent', { dependencies: ['build'] }),
  task('ux-review:extract-real-callouts-fixture', 'npm run ux-review:extract-real-callouts-fixture --silent', { dependencies: ['build'] }),
  task('ux-review:patch-handoff-fixture', 'npm run ux-review:patch-handoff-fixture --silent', { dependencies: ['build'] }),
  task('ux-review:recapture-recheck-fixture', 'npm run ux-review:recapture-recheck-fixture --silent', { dependencies: ['build'] }),
  task('ux-review:no-text-fallback', 'npm run ux-review:no-text-fallback --silent', { dependencies: ['build'] }),
  task('ux-review:no-fake-callouts', 'npm run ux-review:no-fake-callouts --silent', { dependencies: ['build'] }),
  task('ux-review:image-voxel-relations', 'npm run ux-review:image-voxel-relations --silent', { dependencies: ['build'] }),
  task('ppt:imagegen-review-fixture', 'npm run ppt:imagegen-review-fixture --silent', { dependencies: ['build'] }),
  task('ppt:full-e2e-blackbox', 'npm run ppt:full-e2e-blackbox --silent', { dependencies: ['build'] }),
  task('ppt:full-e2e-artifact-graph', 'npm run ppt:full-e2e-artifact-graph --silent', { dependencies: ['ppt:full-e2e-blackbox'] }),
  task('ppt:real-export-adapter', 'npm run ppt:real-export-adapter --silent', { dependencies: ['build'] }),
  task('ppt:real-imagegen-wiring', 'npm run ppt:real-imagegen-wiring --silent', { dependencies: ['build'] }),
  task('ppt:reexport-rereview', 'npm run ppt:reexport-rereview --silent', { dependencies: ['build'] }),
  task('ppt:imagegen-blackbox', 'npm run ppt:imagegen-blackbox --silent', { dependencies: ['build'] }),
  task('ux-ppt:structured-extraction', 'npm run ux-ppt:structured-extraction --silent', { dependencies: ['build'] }),
  task('ppt:slide-export-fixture', 'npm run ppt:slide-export-fixture --silent', { dependencies: ['build'] }),
  task('ppt:no-text-fallback', 'npm run ppt:no-text-fallback --silent', { dependencies: ['build'] }),
  task('ppt:no-mock-as-real', 'npm run ppt:no-mock-as-real --silent', { dependencies: ['build'] }),
  task('ppt:issue-extraction-fixture', 'npm run ppt:issue-extraction-fixture --silent', { dependencies: ['build'] }),
  task('ppt:image-voxel-relations', 'npm run ppt:image-voxel-relations --silent', { dependencies: ['build'] }),
  task('ppt:proof-trust-fixture', 'npm run ppt:proof-trust-fixture --silent', { dependencies: ['build'] }),
  task('dfix:fixture', 'npm run dfix:fixture --silent', { dependencies: ['build'] }),
  task('dfix:fast-kernel', 'npm run dfix:fast-kernel --silent', { dependencies: ['build'] }),
  task('dfix:blackbox-fast', 'npm run dfix:blackbox-fast --silent', { dependencies: ['build'] }),
  task('dfix:performance', 'npm run dfix:performance --silent', { dependencies: ['build'] }),
  task('dfix:patch-handoff', 'npm run dfix:patch-handoff --silent', { dependencies: ['build'] }),
  task('dfix:verification-recommendation', 'npm run dfix:verification-recommendation --silent', { dependencies: ['build'] }),
  task('dfix:verification', 'npm run dfix:verification --silent', { dependencies: ['build'] }),
  task('hooks:strict-subset-check', 'npm run hooks:strict-subset-check --silent', { dependencies: ['build'] }),
  task('hooks:latest-schema-check', 'npm run hooks:latest-schema-check --silent', { dependencies: ['build'] }),
  task('hooks:trust-state-check', 'npm run hooks:trust-state-check --silent', { dependencies: ['build'] }),
  task('hooks:trust-warning-zero', 'npm run hooks:trust-warning-zero --silent', { dependencies: ['build'] }),
  task('hooks:subagent-events-check', 'npm run hooks:subagent-events-check --silent', { dependencies: ['build'] }),
  task('hooks:no-unsupported-handlers', 'npm run hooks:no-unsupported-handlers --silent', { dependencies: ['build'] }),
  task('hooks:actual-parity-check', 'npm run hooks:actual-parity-check --silent', { dependencies: ['build'] }),
  task('hooks:actual-parity-v2', 'npm run hooks:actual-parity-v2 --silent', { dependencies: ['build'] }),
  task('hooks:official-hash-parity', 'npm run hooks:official-hash-parity --silent', { dependencies: ['build'] }),
  task('hooks:official-hash-oracle', 'npm run hooks:official-hash-oracle --silent', { dependencies: ['build'] }),
  task('hooks:managed-install-fixture', 'npm run hooks:managed-install-fixture --silent', { dependencies: ['build'] }),
  task('hooks:runtime-replay-warning-zero', 'npm run hooks:runtime-replay-warning-zero --silent', { dependencies: ['build'] }),
  task('hooks:runtime-replay-warning-zero-v2', 'npm run hooks:runtime-replay-warning-zero-v2 --silent', { dependencies: ['build'] }),
  task('codex-lb:persistence-truth', 'npm run codex-lb:persistence-truth --silent', { dependencies: ['build'] }),
  task('codex-lb:setup-truthfulness', 'npm run codex-lb:setup-truthfulness --silent', { dependencies: ['build'] }),
  task('computer-use:visual-route-fixture', 'npm run computer-use:visual-route-fixture --silent', { dependencies: ['build'] }),
  task('computer-use:live-evidence', 'npm run computer-use:live-evidence --silent', { dependencies: ['build'] }),
  task('codex:0.133-compat', 'npm run codex:0.133-compat --silent', { dependencies: ['build'] }),
  task('codex:output-schema-fixture', 'npm run codex:output-schema-fixture --silent', { dependencies: ['build'] }),
  task('codex:exec-syntax-parity', 'npm run codex:exec-syntax-parity --silent', { dependencies: ['build'] }),
  task('codex:0.133-official-compat', 'npm run codex:0.133-official-compat --silent', { dependencies: ['build'] }),
  task('flagship:proof-graph-v3', 'npm run flagship:proof-graph-v3 --silent', { dependencies: ['build'] }),
  task('mad-sks:permission-model', 'npm run mad-sks:permission-model --silent', { dependencies: ['build'] }),
  task('mad-sks:immutable-harness', 'npm run mad-sks:immutable-harness --silent', { dependencies: ['build'] }),
  task('mad-sks:write-guard', 'npm run mad-sks:write-guard --silent', { dependencies: ['build'] }),
  task('mad-sks:audit-proof', 'npm run mad-sks:audit-proof --silent', { dependencies: ['build'] }),
  task('mad-sks:no-harness-modification', 'npm run mad-sks:no-harness-modification --silent', { dependencies: ['build'] }),
  task('mad-sks:actual-executor', 'npm run mad-sks:actual-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:file-write-executor', 'npm run mad-sks:file-write-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:shell-executor', 'npm run mad-sks:shell-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:package-executor', 'npm run mad-sks:package-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:service-executor', 'npm run mad-sks:service-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:db-executor', 'npm run mad-sks:db-executor --silent', { dependencies: ['build'] }),
  task('mad-sks:rollback-apply', 'npm run mad-sks:rollback-apply --silent', { dependencies: ['build'] }),
  task('mad-sks:live-guard-smoke', 'npm run mad-sks:live-guard-smoke --silent', { dependencies: ['build'] }),
  task('mad-sks:executor-proof-graph', 'npm run mad-sks:executor-proof-graph --silent', { dependencies: ['mad-sks:actual-executor', 'mad-sks:file-write-executor', 'mad-sks:shell-executor', 'mad-sks:package-executor', 'mad-sks:service-executor', 'mad-sks:db-executor', 'mad-sks:rollback-apply', 'mad-sks:live-guard-smoke'] }),
  task('flagship:proof-graph-v4', 'npm run flagship:proof-graph-v4 --silent', { dependencies: ['mad-sks:executor-proof-graph', 'evidence:flagship-coverage', 'release:native-agent-backend', 'test:blackbox'] }),
  task('memory-summary:rebuild-check', 'npm run memory-summary:rebuild-check --silent', { dependencies: ['build'] }),
  task('loop-blocker:check', 'npm run loop-blocker:check --silent', { dependencies: ['build'] }),
  task('docs:truthfulness', 'npm run docs:truthfulness --silent', { dependencies: ['build'] }),
  task('official-docs:compat', 'npm run official-docs:compat --silent', { dependencies: ['build'] }),
  task('blackbox:matrix:contract', 'npm run blackbox:matrix:contract --silent', { dependencies: ['build'] }),
  task('test:blackbox', 'npm run test:blackbox --silent', { dependencies: ['build'] }),
  task('rust:check', 'npm run rust:check --silent', { dependencies: ['build'] }),
  task('rust:smoke', 'npm run rust:smoke --silent', { dependencies: ['build'] }),
  task('release:dist-freshness', 'npm run release:dist-freshness --silent', { dependencies: ['build'] }),
  task('perf:gate', 'npm run perf:gate --silent', { dependencies: ['test:blackbox', 'release:dist-freshness', 'blackbox:matrix:contract', 'rust:check', 'rust:smoke', 'schema:check', 'flagship:proof-graph-v4'], env: { SKS_PERF_TIER: 'source-ci' } }),
  task('typecheck', 'npm run typecheck --silent', { dependencies: ['build'] }),
  task('schema:check', 'npm run schema:check --silent', { dependencies: ['build'] })
];

tasks.push(
  task('release:metadata', 'npm run release:metadata --silent', { dependencies: tasksForMetadata() }),
  task('release:readiness', 'npm run release:readiness --silent', { dependencies: ['release:metadata', 'typecheck', 'schema:check'] })
);

const dag: VerificationDag = buildVerificationDag(tasks);
const result: ParallelVerificationResult = await runVerificationDag(dag, {
  cwd: root,
  concurrency: Number(process.env.SKS_VERIFY_CONCURRENCY || os.cpus().length || 2),
  logDir,
  failFast: false
});
result.dag_schema = dag.schema;
result.dependency_count = tasks.reduce((sum, row) => sum + (row.dependencies ?? []).length, 0);
await writeParallelVerificationProof(reportDir, result);
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;

function task(id: string, command: string, extra: ReleaseTaskExtra = {}): VerificationTask {
  return {
    id,
    command,
    ...extra,
    dependencies: extra.dependencies ?? [],
    outputs: extra.outputs ?? [],
    env: { ...deterministicReleaseEnv, SKS_ENSURE_DIST_NO_REBUILD: '1', ...(extra.env ?? {}) }
  };
}

function tasksForMetadata(): string[] {
  return tasks
    .map((row) => row.id)
    .filter((id) => !['build', 'typecheck', 'schema:check', 'release:metadata', 'release:readiness'].includes(id));
}

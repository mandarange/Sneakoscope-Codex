#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildVerificationDag, type VerificationDag } from '../core/verification/verification-dag.js';
import { writeParallelVerificationProof } from '../core/verification/verification-proof.js';
import { runVerificationDag } from '../core/verification/verification-worker-pool.js';
import type { ParallelVerificationResult, VerificationTask } from '../core/verification/verification-result.js';
import { enforceRetention } from '../core/retention.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const logDir = path.join(reportDir, 'release-parallel-logs');
fs.mkdirSync(logDir, { recursive: true });

type ReleaseTaskExtra = Partial<Pick<VerificationTask, 'cwd' | 'dependencies' | 'env' | 'inputs' | 'outputs' | 'read_only' | 'timeout_ms'>>;

const deterministicReleaseEnv: Record<string, string> = {
  SKS_REQUIRE_ZELLIJ: '0',
  SKS_TEST_REAL_DYNAMIC_AGENTS: '0',
  SKS_REQUIRE_REAL_DYNAMIC_AGENTS: '0',
  SKS_TEST_REAL_CODEX_PATCHES: '0',
  SKS_REQUIRE_REAL_CODEX_PATCHES: '0',
  SKS_TEST_REAL_IMAGEGEN: '0',
  SKS_REAL_IMAGEGEN: '0',
  SKS_CODEX_APP_IMAGEGEN: '0',
  SKS_REQUIRE_REAL_COMPUTER_USE: '0'
};

const tasks: VerificationTask[] = [
  task('build', 'npm run build --silent', { outputs: ['dist'] }),
  task('runtime:no-src-mjs', 'npm run runtime:no-src-mjs --silent', { dependencies: ['build'] }),
  task('runtime:ts-source-of-truth', 'npm run runtime:ts-source-of-truth --silent', { dependencies: ['build'] }),
  task('architecture:guard', 'npm run architecture:guard --silent', { dependencies: ['build', 'runtime:ts-source-of-truth'] }),
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
  task('codex:0.135-compat', 'npm run codex:0.135-compat --silent', { dependencies: ['build'] }),
  task('doctor:codex-doctor-parity', 'npm run doctor:codex-doctor-parity --silent', { dependencies: ['build'] }),
  task('codex:permission-profiles', 'npm run codex:permission-profiles --silent', { dependencies: ['build'] }),
  task('codex:legacy-profile-consumers-removed', 'npm run codex:legacy-profile-consumers-removed --silent', { dependencies: ['build'] }),
  task('codex:resume-cwd-truth', 'npm run codex:resume-cwd-truth --silent', { dependencies: ['build'] }),
  task('mcp:tool-naming-parity', 'npm run mcp:tool-naming-parity --silent', { dependencies: ['build'] }),
  task('responses:retry-policy-centralized', 'npm run responses:retry-policy-centralized --silent', { dependencies: ['build'] }),
  task('terminal:keyboard-enhancement-safety', 'npm run terminal:keyboard-enhancement-safety --silent', { dependencies: ['build'] }),
  task('terminal:tui-output-stability', 'npm run terminal:tui-output-stability --silent', { dependencies: ['build'] }),
  task('goal-mode:official-default', 'npm run goal-mode:official-default --silent', { dependencies: ['build'] }),
  task('agent:main-no-scout', 'npm run agent:main-no-scout --silent', { dependencies: ['build'] }),
  task('agent:worker-scout-limited', 'npm run agent:worker-scout-limited --silent', { dependencies: ['build'] }),
  task('agent:background-terminals', 'npm run agent:background-terminals --silent', { dependencies: ['build'] }),
  task('agent:zellij-runtime', 'npm run agent:zellij-runtime --silent', { dependencies: ['build'] }),
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
  task('zellij:lane-renderer', 'npm run zellij:lane-renderer --silent', { dependencies: ['build'] }),
  task('zellij:layout-valid', 'npm run zellij:layout-valid --silent', { dependencies: ['build'] }),
  task('zellij:pane-proof', 'npm run zellij:pane-proof --silent', { dependencies: ['build'] }),
  task('zellij:screen-proof', 'npm run zellij:screen-proof --silent', { dependencies: ['build'] }),
  task('agent:proof-contract-reconciled', 'npm run agent:proof-contract-reconciled --silent', { dependencies: ['build'] }),
  task('agent:scheduler-proof-hardening', 'npm run agent:scheduler-proof-hardening --silent', { dependencies: ['build'] }),
  task('agent:dynamic-pool', 'npm run agent:dynamic-pool --silent', { dependencies: ['build'] }),
  task('agent:backfill-replenishment', 'npm run agent:backfill-replenishment --silent', { dependencies: ['build'] }),
  task('agent:scheduler-proof', 'npm run agent:scheduler-proof --silent', { dependencies: ['build'] }),
  task('agent:session-generation', 'npm run agent:session-generation --silent', { dependencies: ['build'] }),
  task('agent:terminal-generations', 'npm run agent:terminal-generations --silent', { dependencies: ['build'] }),
  task('mad-sks:zellij-launch', 'npm run mad-sks:zellij-launch --silent', { dependencies: ['build'] }),
  task('runtime:no-tmux', 'npm run runtime:no-tmux --silent', { dependencies: ['build'] }),
  task('agent:cleanup-executor', 'npm run agent:cleanup-executor --silent', { dependencies: ['build'] }),
  task('agent:cleanup-executor-v2', 'npm run agent:cleanup-executor-v2 --silent', { dependencies: ['build'] }),
  task('agent:cleanup-command-ux', 'npm run agent:cleanup-command-ux --silent', { dependencies: ['build'] }),
  task('retention:cleanup-safety', 'npm run retention:cleanup-safety --silent', { dependencies: ['build'] }),
  task('agent:intelligent-work-graph', 'npm run agent:intelligent-work-graph --silent', { dependencies: ['build'] }),
  task('agent:ast-aware-work-graph', 'npm run agent:ast-aware-work-graph --silent', { dependencies: ['build'] }),
  task('proof:fake-vs-real-policy', 'npm run proof:fake-vs-real-policy --silent', { dependencies: ['build'] }),
  task('proof:fake-real-policy-v2', 'npm run proof:fake-real-policy-v2 --silent', { dependencies: ['build'] }),
  task('release:runtime-truth-matrix', 'npm run release:runtime-truth-matrix --silent', { dependencies: ['zellij:pane-proof', 'agent:cleanup-executor-v2', 'agent:ast-aware-work-graph', 'proof:fake-real-policy-v2', 'strategy:adhd-orchestrating-gate', 'strategy:parallel-modification-plan', 'strategy:file-ownership-plan', 'strategy:verification-rollback-dag', 'appshots:evidence', 'appshots:source-intelligence', 'agent:parallel-write-kernel', 'agent:patch-proof', 'agent:patch-swarm-runtime', 'agent:patch-swarm-runtime-truth', 'agent:real-codex-patch-envelope-smoke', 'mcp:readonly-runtime-scheduler'] }),
  task('route:blackbox-realism', 'npm run route:blackbox-realism --silent', { dependencies: ['build'] }),
  task('agent:dynamic-cockpit', 'npm run agent:dynamic-cockpit --silent', { dependencies: ['build'] }),
  task('agent:source-intelligence-propagation', 'npm run agent:source-intelligence-propagation --silent', { dependencies: ['build'] }),
  task('agent:goal-mode-propagation', 'npm run agent:goal-mode-propagation --silent', { dependencies: ['build'] }),
  task('agent:visual-consistency', 'npm run agent:visual-consistency --silent', { dependencies: ['build'] }),
  task('release:parallel-full-coverage', 'npm run release:parallel-full-coverage --silent', { dependencies: ['build'] }),
  task('priority:full-closure', 'npm run priority:full-closure --silent', { dependencies: ['build'] }),
  task('release:native-agent-backend', 'npm run release:native-agent-backend --silent', { dependencies: ['build'] }),
  task('agent:native-cli-session-swarm', 'npm run agent:native-cli-session-swarm --silent', { dependencies: ['build'] }),
  task('naruto:shadow-clone-swarm', 'npm run naruto:shadow-clone-swarm --silent', { dependencies: ['build'] }),
  task('doctor:fix-recovers-corrupted-config', 'npm run doctor:fix-recovers-corrupted-config --silent', { dependencies: ['build'] }),
  task('install:update-preserves-config', 'npm run install:update-preserves-config --silent', { dependencies: ['build'] }),
  task('codex-lb:config-toml-safety', 'npm run codex-lb:config-toml-safety --silent', { dependencies: ['build'] }),
  task('codex-app:ui-preservation', 'npm run codex-app:ui-preservation --silent', { dependencies: ['build'] }),
  task('zellij:launch-command-truth', 'npm run zellij:launch-command-truth --silent', { dependencies: ['build'] }),
  task('zellij:real-session-heartbeat', 'npm run zellij:real-session-heartbeat --silent', { dependencies: ['build'] }),
  task('zellij:ui-design', 'npm run zellij:ui-design --silent', { dependencies: ['build'] }),
  task('legacy:upgrade-zero-break', 'npm run legacy:upgrade-zero-break --silent', { dependencies: ['build'] }),
  task('publish:packlist-performance', 'npm run publish:packlist-performance --silent', { dependencies: ['build'] }),
  task('postinstall:safe-side-effects', 'npm run postinstall:safe-side-effects --silent', { dependencies: ['build'] }),
  task('runtime:ts-rust-boundary', 'npm run runtime:ts-rust-boundary --silent', { dependencies: ['build'] }),
  task('core-skill:card-schema', 'npm run core-skill:card-schema --silent', { dependencies: ['build'] }),
  task('core-skill:rollout-scoring', 'npm run core-skill:rollout-scoring --silent', { dependencies: ['build'] }),
  task('core-skill:patch', 'npm run core-skill:patch --silent', { dependencies: ['build'] }),
  task('core-skill:heldout-validation', 'npm run core-skill:heldout-validation --silent', { dependencies: ['build'] }),
  task('core-skill:deployment-snapshot', 'npm run core-skill:deployment-snapshot --silent', { dependencies: ['build'] }),
  task('core-skill:no-inference-optimizer', 'npm run core-skill:no-inference-optimizer --silent', { dependencies: ['build'] }),
  task('core-skill:route-runtime-integration', 'npm run core-skill:route-runtime-integration --silent', { dependencies: ['build'] }),
  task('core-skill:promotion-side-effect-ledger', 'npm run core-skill:promotion-side-effect-ledger --silent', { dependencies: ['build'] }),
  task('core-skill:legacy-promotion-api-audit', 'npm run core-skill:legacy-promotion-api-audit --silent', { dependencies: ['build'] }),
  task('safety:side-effect-zero', 'npm run safety:side-effect-zero --silent', { dependencies: ['build'] }),
  task('safety:mutation-callsite-coverage', 'npm run safety:mutation-callsite-coverage --silent', { dependencies: ['build'] }),
  task('safety:mutation-callsite-coverage:repo-wide', 'npm run safety:mutation-callsite-coverage:repo-wide --silent', { dependencies: ['build'] }),
  task('side-effect:runtime-report', 'npm run side-effect:runtime-report --silent', { dependencies: ['build'] }),
  task('zellij:doctor-readiness', 'npm run zellij:doctor-readiness --silent', { dependencies: ['build'] }),
  task('release:version-truth', 'npm run release:version-truth --silent', { dependencies: ['build'] }),
  task('release:gate-planner', 'npm run release:gate-planner --silent', { dependencies: ['build'] }),
  task('release:dynamic-performance', 'npm run release:dynamic-performance --silent', { dependencies: ['release:gate-planner'] }),
  task('release:provenance', 'npm run release:provenance --silent', { dependencies: ['build', 'release:version-truth'] }),
  task('release:gate-budget', 'npm run release:gate-budget --silent', { dependencies: ['build'] }),
  task('agent:wiki-context-proof', 'npm run agent:wiki-context-proof --silent', { dependencies: ['build'] }),
  task('shared-memory:check', 'npm run shared-memory:check --silent', { dependencies: ['build'] }),
  task('wrongness:check', 'npm run wrongness:check --silent', { dependencies: ['build'] }),
  task('wrongness:fixtures', 'npm run wrongness:fixtures --silent', { dependencies: ['build'] }),
  task('trust:check', 'npm run trust:check --silent', { dependencies: ['build'] }),
  task('git-collaboration:e2e', 'npm run git-collaboration:e2e --silent', { dependencies: ['build'] }),
  task('agent:native-cli-session-swarm-10', 'npm run agent:native-cli-session-swarm-10 --silent', { dependencies: ['build'] }),
  task('agent:native-cli-session-swarm-20', 'npm run agent:native-cli-session-swarm-20 --silent', { dependencies: ['build'] }),
  task('agent:no-subagent-scaling', 'npm run agent:no-subagent-scaling --silent', { dependencies: ['build'] }),
  task('agent:native-cli-session-proof', 'npm run agent:native-cli-session-proof --silent', { dependencies: ['build'] }),
  task('agent:worker-backend-router', 'npm run agent:worker-backend-router --silent', { dependencies: ['build'] }),
  task('agent:codex-child-overlap', 'npm run agent:codex-child-overlap --silent', { dependencies: ['build'] }),
  task('agent:model-authored-patch-envelope', 'npm run agent:model-authored-patch-envelope --silent', { dependencies: ['build'] }),
  task('agent:fast-mode-default', 'npm run agent:fast-mode-default --silent', { dependencies: ['build'] }),
  task('agent:fast-mode-worker-propagation', 'npm run agent:fast-mode-worker-propagation --silent', { dependencies: ['build'] }),
  task('codex:fast-mode-profile-propagation', 'npm run codex:fast-mode-profile-propagation --silent', { dependencies: ['build'] }),
  task('mad-sks:fast-mode-propagation', 'npm run mad-sks:fast-mode-propagation --silent', { dependencies: ['build'] }),
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
  task('dfix:parallel-write-blackbox', 'npm run dfix:parallel-write-blackbox --silent', { dependencies: ['build'] }),
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
  task('codex:0.134-compat', 'npm run codex:0.134-compat --silent', { dependencies: ['build'] }),
  task('codex:output-schema-fixture', 'npm run codex:output-schema-fixture --silent', { dependencies: ['build'] }),
  task('codex:exec-syntax-parity', 'npm run codex:exec-syntax-parity --silent', { dependencies: ['build'] }),
  task('codex:0.133-official-compat', 'npm run codex:0.133-official-compat --silent', { dependencies: ['build'] }),
  task('codex:0.134-official-compat', 'npm run codex:0.134-official-compat --silent', { dependencies: ['build'] }),
  task('codex:profile-primary', 'npm run codex:profile-primary --silent', { dependencies: ['build'] }),
  task('codex:managed-proxy-env', 'npm run codex:managed-proxy-env --silent', { dependencies: ['build'] }),
  task('codex:0.134-runner-truth', 'npm run codex:0.134-runner-truth --silent', { dependencies: ['build', 'codex:0.134-official-compat', 'codex:managed-proxy-env'] }),
  task('strategy:adhd-orchestrating-gate', 'npm run strategy:adhd-orchestrating-gate --silent', { dependencies: ['build'] }),
  task('strategy:parallel-modification-plan', 'npm run strategy:parallel-modification-plan --silent', { dependencies: ['build'] }),
  task('strategy:file-ownership-plan', 'npm run strategy:file-ownership-plan --silent', { dependencies: ['build'] }),
  task('strategy:verification-rollback-dag', 'npm run strategy:verification-rollback-dag --silent', { dependencies: ['build'] }),
  task('appshots:capability', 'npm run appshots:capability --silent', { dependencies: ['build'] }),
  task('appshots:operator-policy', 'npm run appshots:operator-policy --silent', { dependencies: ['build'] }),
  task('appshots:evidence', 'npm run appshots:evidence --silent', { dependencies: ['build'] }),
  task('appshots:source-intelligence', 'npm run appshots:source-intelligence --silent', { dependencies: ['build'] }),
  task('appshots:thread-attachment-discovery', 'npm run appshots:thread-attachment-discovery --silent', { dependencies: ['build', 'appshots:evidence', 'appshots:source-intelligence'] }),
  task('appshots:triwiki-voxel', 'npm run appshots:triwiki-voxel --silent', { dependencies: ['build'] }),
  task('appshots:privacy-safety', 'npm run appshots:privacy-safety --silent', { dependencies: ['build'] }),
  task('mcp:0.134-modernization', 'npm run mcp:0.134-modernization --silent', { dependencies: ['build'] }),
  task('mcp:readonly-concurrency', 'npm run mcp:readonly-concurrency --silent', { dependencies: ['build'] }),
  task('mcp:readonly-runtime-scheduler', 'npm run mcp:readonly-runtime-scheduler --silent', { dependencies: ['build', 'mcp:readonly-concurrency'] }),
  task('source-intelligence:codex-history-search', 'npm run source-intelligence:codex-history-search --silent', { dependencies: ['build'] }),
  task('hooks:0.134-context-parity', 'npm run hooks:0.134-context-parity --silent', { dependencies: ['build'] }),
  task('agent:parallel-write-kernel', 'npm run agent:parallel-write-kernel --silent', { dependencies: ['build'] }),
  task('agent:parallel-write-blackbox', 'npm run agent:parallel-write-blackbox --silent', { dependencies: ['build'] }),
  task('team:parallel-write-blackbox', 'npm run team:parallel-write-blackbox --silent', { dependencies: ['build'] }),
  task('agent:patch-envelope-extraction', 'npm run agent:patch-envelope-extraction --silent', { dependencies: ['build'] }),
  task('agent:patch-queue-runtime', 'npm run agent:patch-queue-runtime --silent', { dependencies: ['build'] }),
  task('agent:strategy-to-lease-wiring', 'npm run agent:strategy-to-lease-wiring --silent', { dependencies: ['build'] }),
  task('agent:patch-swarm-runtime', 'npm run agent:patch-swarm-runtime --silent', { dependencies: ['build', 'agent:patch-envelope-extraction', 'agent:patch-queue-runtime', 'agent:strategy-to-lease-wiring'] }),
  task('agent:patch-transaction-journal', 'npm run agent:patch-transaction-journal --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('agent:patch-conflict-rebase', 'npm run agent:patch-conflict-rebase --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('agent:strategy-to-patch-strict', 'npm run agent:strategy-to-patch-strict --silent', { dependencies: ['build', 'strategy:verification-rollback-dag', 'strategy:file-ownership-plan'] }),
  task('agent:patch-swarm-runtime-truth', 'npm run agent:patch-swarm-runtime-truth --silent', { dependencies: ['build', 'agent:patch-transaction-journal', 'agent:patch-conflict-rebase', 'agent:strategy-to-patch-strict'] }),
  task('agent:rollback-command', 'npm run agent:rollback-command --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('agent:real-codex-patch-envelope-smoke', 'npm run agent:real-codex-patch-envelope-smoke --silent', { dependencies: ['build'] }),
  task('agent:patch-verification-dag', 'npm run agent:patch-verification-dag --silent', { dependencies: ['build'] }),
  task('agent:patch-rollback-dag', 'npm run agent:patch-rollback-dag --silent', { dependencies: ['build'] }),
  task('agent:patch-proof-runtime', 'npm run agent:patch-proof-runtime --silent', { dependencies: ['build', 'agent:patch-verification-dag', 'agent:patch-rollback-dag'] }),
  task('agent:patch-swarm-route-blackbox', 'npm run agent:patch-swarm-route-blackbox --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('team:patch-swarm-route-blackbox', 'npm run team:patch-swarm-route-blackbox --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('dfix:patch-swarm-route-blackbox', 'npm run dfix:patch-swarm-route-blackbox --silent', { dependencies: ['build', 'agent:patch-swarm-runtime'] }),
  task('agent:patch-proof', 'npm run agent:patch-proof --silent', { dependencies: ['build'] }),
  task('agent:patch-rollback', 'npm run agent:patch-rollback --silent', { dependencies: ['build'] }),
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
  task('test:blackbox', 'npm run test:blackbox --silent', { dependencies: ['build'], timeout_ms: 20 * 60 * 1000 }),
  task('rust:check', 'npm run rust:check --silent', { dependencies: ['build'] }),
  task('rust:smoke', 'npm run rust:smoke --silent', { dependencies: ['build'] }),
  task('release:dist-freshness', 'npm run release:dist-freshness --silent', { dependencies: ['build'] }),
  task('release:gate-existence-audit', 'npm run release:gate-existence-audit --silent', { dependencies: ['build'] }),
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
if (result.ok) summarizeReleaseLogsForCleanup(result, logDir);
await writeParallelVerificationProof(reportDir, result);
if (result.ok) {
  const retention = await enforceRetention(root, {
    afterReleaseCheck: true,
    pruneReportLogs: true,
    policy: { max_tmp_age_hours: 0 }
  }).catch((err: any) => ({ ok: false, error: err?.message || String(err), actions: [] }));
  (result as any).retention_cleanup = {
    ok: (retention as any).ok !== false,
    action_count: Array.isArray((retention as any).actions) ? (retention as any).actions.length : 0,
    cleanup_report: '.sneakoscope/reports/retention-cleanup.json'
  };
  await writeParallelVerificationProof(reportDir, result);
}
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);

function summarizeReleaseLogsForCleanup(result: ParallelVerificationResult, logDir: string): void {
  const prefix = `${path.resolve(logDir)}${path.sep}`;
  for (const row of result.results as any[]) {
    summarizeLog(row, 'stdout', prefix);
    summarizeLog(row, 'stderr', prefix);
  }
}

function summarizeLog(row: any, stream: 'stdout' | 'stderr', prefix: string): void {
  const key = `${stream}_log`;
  const file = row[key];
  if (!file || !path.resolve(String(file)).startsWith(prefix)) return;
  let bytes = 0;
  let tail = '';
  try {
    const st = fs.statSync(file);
    bytes = st.size;
    const readBytes = Math.min(st.size, 2048);
    if (readBytes > 0) {
      const fd = fs.openSync(file, 'r');
      try {
        const buf = Buffer.alloc(readBytes);
        fs.readSync(fd, buf, 0, readBytes, Math.max(0, st.size - readBytes));
        tail = buf.toString('utf8');
      } finally {
        fs.closeSync(fd);
      }
    }
  } catch {}
  row[`${stream}_log_summary`] = `summarized_inline:${bytes}B`;
  row[`${stream}_tail`] = tail.slice(-2048);
  row[`${stream}_log_removed_after_summary`] = true;
  delete row[key];
}

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

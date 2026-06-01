#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = readJson('package.json');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const RELEASE_VERSION = pkg.version;
const jsonPath = path.join(reportDir, `release-readiness-${RELEASE_VERSION}.json`);
const mdPath = path.join(reportDir, `release-readiness-${RELEASE_VERSION}.md`);
const releaseParallelCheckSource = readText('src/scripts/release-parallel-check.ts', '');
const releaseRealCheckSource = readText('scripts/release-real-check.mjs', '');

const checks = {
  runtime_no_src_mjs: scriptContains('release:check:parallel', 'runtime:no-src-mjs'),
  runtime_ts_source_of_truth: scriptContains('release:check:parallel', 'runtime:ts-source-of-truth'),
  runtime_dist_parity: scriptContains('release:check:parallel', 'runtime:dist-parity'),
  route_proof_artifact_structure: scriptContains('release:check:parallel', 'routes:proof-artifact-structure'),
  agent_codex_app_cockpit: scriptContains('release:check:parallel', 'agent:codex-app-cockpit'),
  agent_janitor: scriptContains('release:check:parallel', 'agent:janitor'),
  agent_multi_project_isolation: scriptContains('release:check:parallel', 'agent:multi-project-isolation'),
  verification_parallel_engine: scriptContains('release:check:parallel', 'verification:parallel-engine'),
  hook_strict_subset: scriptContains('release:check', 'hooks:strict-subset-check'),
  hooks_official_hash_oracle: scriptContains('release:check', 'hooks:official-hash-oracle'),
  hooks_actual_parity_v2: scriptContains('release:check', 'hooks:actual-parity-v2'),
  hooks_runtime_replay_warning_zero_v2: scriptContains('release:check', 'hooks:runtime-replay-warning-zero-v2'),
  ppt_full_e2e_blackbox: scriptContains('release:check', 'ppt:full-e2e-blackbox'),
  ppt_full_e2e_artifact_graph: scriptContains('release:check', 'ppt:full-e2e-artifact-graph'),
  codex_0133_official_compat: scriptContains('release:check', 'codex:0.133-official-compat'),
  codex_0134_compat: scriptContains('release:check', 'codex:0.134-compat'),
  codex_0134_official_compat: scriptContains('release:check', 'codex:0.134-official-compat'),
  codex_profile_primary: scriptContains('release:check', 'codex:profile-primary'),
  codex_managed_proxy_env: scriptContains('release:check', 'codex:managed-proxy-env'),
  codex_0134_runner_truth: scriptContains('release:check', 'codex:0.134-runner-truth'),
  mcp_0134_modernization: scriptContains('release:check', 'mcp:0.134-modernization'),
  mcp_readonly_runtime_scheduler: scriptContains('release:check', 'mcp:readonly-runtime-scheduler'),
  appshots_thread_attachment_discovery: scriptContains('release:check', 'appshots:thread-attachment-discovery'),
  source_intelligence_codex_history_search: scriptContains('release:check', 'source-intelligence:codex-history-search'),
  agent_parallel_write_kernel: scriptContains('release:check', 'agent:parallel-write-kernel'),
  agent_parallel_write_blackbox: scriptContains('release:check', 'agent:parallel-write-blackbox'),
  team_parallel_write_blackbox: scriptContains('release:check', 'team:parallel-write-blackbox'),
  dfix_parallel_write_blackbox: scriptContains('release:check', 'dfix:parallel-write-blackbox'),
  agent_patch_envelope_extraction: scriptContains('release:check', 'agent:patch-envelope-extraction'),
  agent_patch_queue_runtime: scriptContains('release:check', 'agent:patch-queue-runtime'),
  agent_strategy_to_lease_wiring: scriptContains('release:check', 'agent:strategy-to-lease-wiring'),
  agent_patch_swarm_runtime: scriptContains('release:check', 'agent:patch-swarm-runtime'),
  agent_patch_swarm_runtime_truth: scriptContains('release:check', 'agent:patch-swarm-runtime-truth'),
  agent_patch_transaction_journal: scriptContains('release:check', 'agent:patch-transaction-journal'),
  agent_patch_conflict_rebase: scriptContains('release:check', 'agent:patch-conflict-rebase'),
  agent_strategy_to_patch_strict: scriptContains('release:check', 'agent:strategy-to-patch-strict'),
  agent_rollback_command: scriptContains('release:check', 'agent:rollback-command'),
  agent_native_cli_session_swarm: scriptContains('release:check', 'agent:native-cli-session-swarm'),
  agent_native_cli_session_swarm_10: scriptContains('release:check', 'agent:native-cli-session-swarm-10'),
  agent_native_cli_session_swarm_20: scriptContains('release:check', 'agent:native-cli-session-swarm-20'),
  agent_no_subagent_scaling: scriptContains('release:check', 'agent:no-subagent-scaling'),
  agent_native_cli_session_proof: scriptContains('release:check', 'agent:native-cli-session-proof'),
  agent_worker_backend_router: scriptContains('release:check', 'agent:worker-backend-router'),
  agent_codex_child_overlap: scriptContains('release:check', 'agent:codex-child-overlap'),
  agent_model_authored_patch_envelope: scriptContains('release:check', 'agent:model-authored-patch-envelope'),
  zellij_pane_proof: scriptContains('release:check', 'zellij:pane-proof'),
  zellij_screen_proof: scriptContains('release:check', 'zellij:screen-proof'),
  zellij_lane_renderer: scriptContains('release:check', 'zellij:lane-renderer'),
  mad_sks_zellij_launch: scriptContains('release:check', 'mad-sks:zellij-launch'),
  agent_fast_mode_default: scriptContains('release:check', 'agent:fast-mode-default'),
  agent_fast_mode_worker_propagation: scriptContains('release:check', 'agent:fast-mode-worker-propagation'),
  codex_fast_mode_profile_propagation: scriptContains('release:check', 'codex:fast-mode-profile-propagation'),
  mad_sks_fast_mode_propagation: scriptContains('release:check', 'mad-sks:fast-mode-propagation'),
  agent_patch_verification_dag: scriptContains('release:check', 'agent:patch-verification-dag'),
  agent_patch_rollback_dag: scriptContains('release:check', 'agent:patch-rollback-dag'),
  agent_patch_proof_runtime: scriptContains('release:check', 'agent:patch-proof-runtime'),
  agent_patch_swarm_route_blackbox: scriptContains('release:check', 'agent:patch-swarm-route-blackbox'),
  team_patch_swarm_route_blackbox: scriptContains('release:check', 'team:patch-swarm-route-blackbox'),
  dfix_patch_swarm_route_blackbox: scriptContains('release:check', 'dfix:patch-swarm-route-blackbox'),
  agent_patch_proof: scriptContains('release:check', 'agent:patch-proof'),
  agent_patch_rollback: scriptContains('release:check', 'agent:patch-rollback'),
  release_gate_existence_audit: scriptContains('release:check', 'release:gate-existence-audit'),
  flagship_proof_graph_v3: scriptContains('release:check', 'flagship:proof-graph-v3'),
  flagship_proof_graph_v4: scriptContains('release:check', 'flagship:proof-graph-v4'),
  mad_sks_actual_executor: scriptContains('release:check', 'mad-sks:actual-executor'),
  mad_sks_file_write_executor: scriptContains('release:check', 'mad-sks:file-write-executor'),
  mad_sks_shell_executor: scriptContains('release:check', 'mad-sks:shell-executor'),
  mad_sks_package_executor: scriptContains('release:check', 'mad-sks:package-executor'),
  mad_sks_service_executor: scriptContains('release:check', 'mad-sks:service-executor'),
  mad_sks_db_executor: scriptContains('release:check', 'mad-sks:db-executor'),
  mad_sks_rollback_apply: scriptContains('release:check', 'mad-sks:rollback-apply'),
  mad_sks_live_guard_smoke: scriptContains('release:check', 'mad-sks:live-guard-smoke'),
  mad_sks_executor_proof_graph: scriptContains('release:check', 'mad-sks:executor-proof-graph'),
  legacy_multiagent_removed: scriptContains('release:check', 'agent:legacy-multiagent-removed'),
  codex_lb_persistence_truth: scriptContains('release:check', 'codex-lb:persistence-truth'),
  computer_use_live_evidence: scriptContains('release:check', 'computer-use:live-evidence'),
  docs_truthfulness: scriptContains('release:check', 'docs:truthfulness'),
  release_readiness: scriptContains('release:check:parallel', 'release:readiness'),
  xai_mcp_capability: scriptContains('release:check:parallel', 'xai-mcp:capability'),
  source_intelligence_policy: scriptContains('release:check:parallel', 'source-intelligence:policy'),
  source_intelligence_all_modes: scriptContains('release:check:parallel', 'source-intelligence:all-modes'),
  codex_web_adapter: scriptContains('release:check:parallel', 'codex-web:adapter'),
  goal_mode_official_default: scriptContains('release:check:parallel', 'goal-mode:official-default'),
  agent_main_no_scout: scriptContains('release:check:parallel', 'agent:main-no-scout'),
  agent_worker_scout_limited: scriptContains('release:check:parallel', 'agent:worker-scout-limited'),
  agent_background_terminals: scriptContains('release:check:parallel', 'agent:background-terminals'),
  agent_zellij_runtime: scriptContains('release:check:parallel', 'agent:zellij-runtime'),
  agent_task_graph_expansion: scriptContains('release:check:parallel', 'agent:task-graph-expansion'),
  agent_follow_up_work_schema: scriptContains('release:check:parallel', 'agent:follow-up-work-schema'),
  agent_dynamic_pool_route_blackbox: scriptContains('release:check:parallel', 'agent:dynamic-pool-route-blackbox'),
  agent_backfill_route_blackbox: scriptContains('release:check:parallel', 'agent:backfill-route-blackbox'),
  agent_cli_options_to_task_graph: scriptContains('release:check:parallel', 'agent:cli-options-to-task-graph'),
  agent_route_truth_backfill: scriptContains('release:check:parallel', 'agent:route-truth-backfill'),
  team_backfill_route_blackbox: scriptContains('release:check:parallel', 'team:backfill-route-blackbox'),
  team_actual_route_backfill: scriptContains('release:check:parallel', 'team:actual-route-backfill'),
  research_backfill_route_blackbox: scriptContains('release:check:parallel', 'research:backfill-route-blackbox'),
  research_actual_route_backfill: scriptContains('release:check:parallel', 'research:actual-route-backfill'),
  qa_backfill_route_blackbox: scriptContains('release:check:parallel', 'qa:backfill-route-blackbox'),
  qa_actual_route_backfill: scriptContains('release:check:parallel', 'qa:actual-route-backfill'),
  zellij_layout_valid: scriptContains('release:check:parallel', 'zellij:layout-valid'),
  zellij_lane_renderer_parallel: scriptContains('release:check:parallel', 'zellij:lane-renderer'),
  zellij_pane_proof_parallel: scriptContains('release:check:parallel', 'zellij:pane-proof'),
  zellij_screen_proof_parallel: scriptContains('release:check:parallel', 'zellij:screen-proof'),
  agent_proof_contract_reconciled: scriptContains('release:check:parallel', 'agent:proof-contract-reconciled'),
  agent_scheduler_proof_hardening: scriptContains('release:check:parallel', 'agent:scheduler-proof-hardening'),
  agent_dynamic_pool: scriptContains('release:check:parallel', 'agent:dynamic-pool'),
  agent_backfill_replenishment: scriptContains('release:check:parallel', 'agent:backfill-replenishment'),
  agent_scheduler_proof: scriptContains('release:check:parallel', 'agent:scheduler-proof'),
  agent_session_generation: scriptContains('release:check:parallel', 'agent:session-generation'),
  agent_terminal_generations: scriptContains('release:check:parallel', 'agent:terminal-generations'),
  agent_zellij_runtime_parallel: scriptContains('release:check:parallel', 'agent:zellij-runtime'),
  zellij_pane_lifecycle: scriptContains('release:check:parallel', 'zellij:pane-proof'),
  zellij_physical_proof: scriptContains('release:check:parallel', 'zellij:screen-proof'),
  agent_cleanup_executor: scriptContains('release:check:parallel', 'agent:cleanup-executor'),
  agent_cleanup_executor_v2: scriptContains('release:check:parallel', 'agent:cleanup-executor-v2'),
  agent_cleanup_command_ux: scriptContains('release:check:parallel', 'agent:cleanup-command-ux'),
  retention_cleanup_safety: scriptContains('release:check:parallel', 'retention:cleanup-safety'),
  agent_intelligent_work_graph: scriptContains('release:check:parallel', 'agent:intelligent-work-graph'),
  agent_ast_aware_work_graph: scriptContains('release:check:parallel', 'agent:ast-aware-work-graph'),
  proof_fake_vs_real_policy: scriptContains('release:check:parallel', 'proof:fake-vs-real-policy'),
  proof_fake_real_policy_v2: scriptContains('release:check:parallel', 'proof:fake-real-policy-v2'),
  release_runtime_truth_matrix: scriptContains('release:check:parallel', 'release:runtime-truth-matrix'),
  route_blackbox_realism: scriptContains('release:check:parallel', 'route:blackbox-realism'),
  real_zellij_pane_proof: scriptContains('release:real-check', 'zellij:pane-proof'),
  real_codex_patch_envelope_smoke: scriptContains('release:real-check', 'agent:real-codex-patch-envelope-smoke'),
  real_codex_parallel_workers: scriptContains('release:real-check', 'agent:real-codex-parallel-workers'),
  real_codex_parallel_workers_5: scriptContains('release:real-check', 'agent:real-codex-parallel-workers-5'),
  real_codex_parallel_workers_10: scriptContains('release:real-check', 'agent:real-codex-parallel-workers-10'),
  real_codex_parallel_workers_20: scriptContains('release:real-check', 'agent:real-codex-parallel-workers-20'),
  real_codex_dynamic_smoke_v2: scriptContains('release:real-check', 'agent:real-codex-dynamic-smoke-v2'),
  real_codex_dynamic_smoke: scriptContains('release:real-check', 'agent:real-codex-dynamic-smoke'),
  agent_dynamic_cockpit: scriptContains('release:check:parallel', 'agent:dynamic-cockpit'),
  agent_source_intelligence_propagation: scriptContains('release:check:parallel', 'agent:source-intelligence-propagation'),
  agent_goal_mode_propagation: scriptContains('release:check:parallel', 'agent:goal-mode-propagation'),
  agent_visual_consistency: scriptContains('release:check:parallel', 'agent:visual-consistency'),
  release_parallel_full_coverage: scriptContains('release:check:parallel', 'release:parallel-full-coverage'),
  priority_full_closure: scriptContains('release:check:parallel', 'priority:full-closure'),
  release_native_agent_backend: scriptContains('release:check', 'release:native-agent-backend'),
  codex_0133_compat: scriptContains('release:check', 'codex:0.133-compat'),
  codex_output_schema_fixture: scriptContains('release:check', 'codex:output-schema-fixture'),
  image_fidelity_check: scriptContains('release:check', 'image-fidelity:check'),
  imagegen_capability: scriptContains('release:check', 'imagegen:capability'),
  gpt_image_2_request_validator: scriptContains('release:check', 'imagegen:gpt-image-2-request-validator'),
  ux_review_run_wires_imagegen: scriptContains('release:check', 'ux-review:run-wires-imagegen'),
  ux_review_extract_wires_real_extractor: scriptContains('release:check', 'ux-review:extract-wires-real-extractor'),
  ux_review_patch_diff_recheck: scriptContains('release:check', 'ux-review:patch-diff-recheck'),
  ux_review_imagegen_blackbox: scriptContains('release:check', 'ux-review:imagegen-blackbox'),
  ux_review_real_loop_fixture: scriptContains('release:check', 'ux-review:real-loop-fixture'),
  ux_review_generate_callouts_fixture: scriptContains('release:check', 'ux-review:generate-callouts-fixture'),
  ux_review_extract_real_callouts_fixture: scriptContains('release:check', 'ux-review:extract-real-callouts-fixture'),
  ux_review_patch_handoff_fixture: scriptContains('release:check', 'ux-review:patch-handoff-fixture'),
  ux_review_recapture_recheck_fixture: scriptContains('release:check', 'ux-review:recapture-recheck-fixture'),
  ux_review_no_text_fallback: scriptContains('release:check', 'ux-review:no-text-fallback'),
  ux_review_no_fake_callouts: scriptContains('release:check', 'ux-review:no-fake-callouts'),
  ux_review_image_voxel_relations: scriptContains('release:check', 'ux-review:image-voxel-relations'),
  ppt_imagegen_review_fixture: scriptContains('release:check', 'ppt:imagegen-review-fixture'),
  ppt_real_export_adapter: scriptContains('release:check', 'ppt:real-export-adapter'),
  ppt_real_imagegen_wiring: scriptContains('release:check', 'ppt:real-imagegen-wiring'),
  ppt_reexport_rereview: scriptContains('release:check', 'ppt:reexport-rereview'),
  ppt_imagegen_blackbox: scriptContains('release:check', 'ppt:imagegen-blackbox'),
  ux_ppt_structured_extraction: scriptContains('release:check', 'ux-ppt:structured-extraction'),
  ppt_slide_export_fixture: scriptContains('release:check', 'ppt:slide-export-fixture'),
  ppt_no_text_fallback: scriptContains('release:check', 'ppt:no-text-fallback'),
  ppt_no_mock_as_real: scriptContains('release:check', 'ppt:no-mock-as-real'),
  ppt_issue_extraction_fixture: scriptContains('release:check', 'ppt:issue-extraction-fixture'),
  ppt_image_voxel_relations: scriptContains('release:check', 'ppt:image-voxel-relations'),
  ppt_proof_trust_fixture: scriptContains('release:check', 'ppt:proof-trust-fixture'),
  dfix_fixture: scriptContains('release:check', 'dfix:fixture'),
  dfix_fast_kernel: scriptContains('release:check', 'dfix:fast-kernel'),
  dfix_blackbox_fast: scriptContains('release:check', 'dfix:blackbox-fast'),
  dfix_performance: scriptContains('release:check', 'dfix:performance'),
  dfix_patch_handoff: scriptContains('release:check', 'dfix:patch-handoff'),
  dfix_verification_recommendation: scriptContains('release:check', 'dfix:verification-recommendation'),
  dfix_verification: scriptContains('release:check', 'dfix:verification'),
  hooks_latest_schema_check: scriptContains('release:check', 'hooks:latest-schema-check'),
  hooks_trust_state_check: scriptContains('release:check', 'hooks:trust-state-check'),
  hooks_trust_warning_zero: scriptContains('release:check', 'hooks:trust-warning-zero'),
  hooks_subagent_events_check: scriptContains('release:check', 'hooks:subagent-events-check'),
  hooks_no_unsupported_handlers: scriptContains('release:check', 'hooks:no-unsupported-handlers'),
  hooks_actual_parity_check: scriptContains('release:check', 'hooks:actual-parity-check'),
  hooks_official_hash_parity: scriptContains('release:check', 'hooks:official-hash-parity'),
  hooks_managed_install_fixture: scriptContains('release:check', 'hooks:managed-install-fixture'),
  hooks_runtime_replay_warning_zero: scriptContains('release:check', 'hooks:runtime-replay-warning-zero'),
  all_features_completion: scriptContains('release:check', 'all-features:completion'),
  all_features_deep_completion: scriptContains('release:check', 'all-features:deep-completion'),
  evidence_flagship_coverage: scriptContains('release:check', 'evidence:flagship-coverage'),
  json_schema_recursive_check: scriptContains('release:check', 'json-schema:recursive-check'),
  release_metadata: scriptContains('release:check:parallel', 'release:metadata'),
  memory_summary_rebuild_check: scriptContains('release:check', 'memory-summary:rebuild-check'),
  loop_blocker_check: scriptContains('release:check', 'loop-blocker:check'),
  official_docs_compat: scriptContains('release:check', 'official-docs:compat'),
  update_check_function_only: fileContains('src/core/update-check.ts', 'pipeline_required: false')
    && fileContains('src/core/update-check.ts', "mode: 'function'")
    && fileContains('src/core/hooks-runtime.ts', 'runSksUpdateCheck')
};
const docs = runNodeScript('scripts/docs-truthfulness-check.mjs');
const officialDocs = runNodeScriptWithOkReportCache(
  'scripts/official-docs-compat-report.mjs',
  `.sneakoscope/reports/official-docs-compat-${RELEASE_VERSION}.json`,
  ['scripts/official-docs-compat-report.mjs', 'package.json', 'package-lock.json']
);
const releaseMetadata = runNodeScript('scripts/release-metadata-check.mjs');
const sideEffectRuntime = runNodeScript('scripts/side-effect-runtime-report-check.mjs');
const releaseProvenance = runNodeScript('scripts/release-provenance-check.mjs');
const imagegenCore = runNodeScript('scripts/imagegen-capability-check.mjs');
const dynamicReleaseMode = process.env.SKS_RELEASE_DYNAMIC === '1';
const runtimeReports = {
  ppt_full_e2e_blackbox: readJson('.sneakoscope/reports/ppt-full-e2e-blackbox.json', null),
  flagship_proof_graph_v3: readJson('.sneakoscope/reports/flagship-proof-graph-v3.json', null),
  flagship_proof_graph_v4: readJson('.sneakoscope/reports/flagship-proof-graph-v4.json', null),
  runtime_truth_matrix: readJson(`.sneakoscope/reports/runtime-truth-matrix-${RELEASE_VERSION}.json`, null),
  real_codex_dynamic_smoke: readJson(`.sneakoscope/reports/agent-real-codex-dynamic-smoke-${RELEASE_VERSION}.json`, null),
  codex_0_134_official_compat: readJson('.sneakoscope/reports/codex-0-134-official-compat.json', null),
  codex_0_134_runner_truth: readJson('.sneakoscope/reports/codex-0-134-runner-truth.json', null),
  mcp_0_134_modernization: readJson('.sneakoscope/reports/mcp-0-134-modernization.json', null),
  mcp_readonly_runtime_scheduler: readJson('.sneakoscope/reports/mcp-readonly-runtime-scheduler.json', null),
  appshots_thread_attachment_discovery: readJson('.sneakoscope/reports/appshots-thread-attachment-discovery.json', null),
  agent_parallel_write_kernel: readJson('.sneakoscope/reports/agent-parallel-write-kernel.json', null),
  agent_parallel_write_blackbox: readJson('.sneakoscope/reports/agent-parallel-write-blackbox.json', null),
  team_parallel_write_blackbox: readJson('.sneakoscope/reports/team-parallel-write-blackbox.json', null),
  dfix_parallel_write_blackbox: readJson('.sneakoscope/reports/dfix-parallel-write-blackbox.json', null),
  agent_patch_envelope_extraction: readJson('.sneakoscope/reports/agent-patch-envelope-extraction.json', null),
  agent_patch_queue_runtime: readJson('.sneakoscope/reports/agent-patch-queue-runtime.json', null),
  agent_strategy_to_lease_wiring: readJson('.sneakoscope/reports/agent-strategy-to-lease-wiring.json', null),
  agent_patch_swarm_runtime: readJson('.sneakoscope/reports/agent-patch-swarm-runtime.json', null),
  agent_patch_swarm_runtime_truth: readJson('.sneakoscope/reports/agent-patch-swarm-runtime-truth.json', null),
  agent_patch_transaction_journal: readJson('.sneakoscope/reports/agent-patch-transaction-journal.json', null),
  agent_patch_conflict_rebase: readJson('.sneakoscope/reports/agent-patch-conflict-rebase.json', null),
  agent_strategy_to_patch_strict: readJson('.sneakoscope/reports/agent-strategy-to-patch-strict.json', null),
  agent_rollback_command: readJson('.sneakoscope/reports/agent-rollback-command.json', null),
  agent_native_cli_session_swarm: readJson('.sneakoscope/reports/agent-native-cli-session-swarm.json', null),
  agent_native_cli_session_swarm_10: readJson('.sneakoscope/reports/agent-native-cli-session-swarm-10.json', null),
  agent_native_cli_session_swarm_20: readJson('.sneakoscope/reports/agent-native-cli-session-swarm-20.json', null),
  agent_no_subagent_scaling: readJson('.sneakoscope/reports/agent-no-subagent-scaling.json', null),
  agent_native_cli_session_proof: readJson('.sneakoscope/reports/agent-native-cli-session-proof.json', null),
  agent_worker_backend_router: readJson('.sneakoscope/reports/agent-worker-backend-router.json', null),
  agent_codex_child_overlap: readJson('.sneakoscope/reports/agent-codex-child-overlap.json', null),
  agent_model_authored_patch_envelope: readJson('.sneakoscope/reports/agent-model-authored-patch-envelope.json', null),
  zellij_pane_proof: readJson('.sneakoscope/reports/zellij-pane-proof.json', null),
  zellij_screen_proof: readJson('.sneakoscope/reports/zellij-screen-proof.json', null),
  zellij_lane_renderer: readJson('.sneakoscope/reports/zellij-lane-renderer.json', null),
  mad_sks_zellij_launch: readJson('.sneakoscope/reports/mad-sks-zellij-launch.json', null),
  agent_zellij_runtime: readJson('.sneakoscope/reports/agent-zellij-runtime.json', null),
  real_codex_parallel_workers: readJson('.sneakoscope/reports/agent-real-codex-parallel-workers.json', null),
  agent_fast_mode_default: readJson('.sneakoscope/reports/agent-fast-mode-default.json', null),
  agent_fast_mode_worker_propagation: readJson('.sneakoscope/reports/agent-fast-mode-worker-propagation.json', null),
  codex_fast_mode_profile_propagation: readJson('.sneakoscope/reports/codex-fast-mode-profile-propagation.json', null),
  mad_sks_fast_mode_propagation: readJson('.sneakoscope/reports/mad-sks-fast-mode-propagation.json', null),
  real_codex_patch_envelope_smoke: readJson('.sneakoscope/reports/agent-real-codex-patch-envelope-smoke.json', null),
  agent_patch_verification_dag: readJson('.sneakoscope/reports/agent-patch-verification-dag.json', null),
  agent_patch_rollback_dag: readJson('.sneakoscope/reports/agent-patch-rollback-dag.json', null),
  agent_patch_proof_runtime: readJson('.sneakoscope/reports/agent-patch-proof-runtime.json', null),
  agent_patch_swarm_route_blackbox: readJson('.sneakoscope/reports/agent-patch-swarm-route-blackbox.json', null),
  team_patch_swarm_route_blackbox: readJson('.sneakoscope/reports/team-patch-swarm-route-blackbox.json', null),
  dfix_patch_swarm_route_blackbox: readJson('.sneakoscope/reports/dfix-patch-swarm-route-blackbox.json', null),
  agent_patch_proof: readJson('.sneakoscope/reports/agent-patch-proof.json', null),
  agent_patch_rollback: readJson('.sneakoscope/reports/agent-patch-rollback.json', null),
  retention_cleanup_safety: readJson('.sneakoscope/reports/retention-cleanup-safety.json', null)
};
const runtimeChecks = {
  ppt_full_e2e_blackbox: runtimeReports.ppt_full_e2e_blackbox?.ok === true
    && ['verified', 'verified_partial'].includes(String(runtimeReports.ppt_full_e2e_blackbox?.proof_status || ''))
    && runtimeReports.ppt_full_e2e_blackbox?.trust_ok === true
    && !['blocked', 'failed', 'not_verified'].includes(String(runtimeReports.ppt_full_e2e_blackbox?.trust_status || '')),
  flagship_proof_graph_v3: runtimeReports.flagship_proof_graph_v3?.ok === true,
  flagship_proof_graph_v4: runtimeReports.flagship_proof_graph_v4?.ok === true,
  runtime_truth_matrix: runtimeReports.runtime_truth_matrix?.ok === true
    && Array.isArray(runtimeReports.runtime_truth_matrix?.rows)
    && runtimeReports.runtime_truth_matrix.rows.every((row) => row.required_mode !== true || !['blocked', 'real_required_missing', 'integration_optional'].includes(String(row.proof_level || ''))),
  real_codex_dynamic_smoke: !runtimeReports.real_codex_dynamic_smoke
    || ['proven', 'fixture_instrumented_real', 'integration_optional'].includes(String(runtimeReports.real_codex_dynamic_smoke?.proof_level || runtimeReports.real_codex_dynamic_smoke?.status || ''))
  ,
  real_codex_patch_envelope_smoke: !runtimeReports.real_codex_patch_envelope_smoke
    || ['proven', 'fixture_instrumented_real', 'integration_optional'].includes(String(runtimeReports.real_codex_patch_envelope_smoke?.proof_level || runtimeReports.real_codex_patch_envelope_smoke?.status || ''))
  ,
  real_codex_parallel_workers: !runtimeReports.real_codex_parallel_workers
    || ['proven', 'fixture_instrumented_real', 'integration_optional'].includes(String(runtimeReports.real_codex_parallel_workers?.proof_level || runtimeReports.real_codex_parallel_workers?.status || ''))
  ,
  retention_cleanup_safety: runtimeReports.retention_cleanup_safety?.ok === true
};
const remainingP0 = [];
if (pkg.version !== RELEASE_VERSION) remainingP0.push(`package_version_not_${RELEASE_VERSION}`);
for (const [name, ok] of Object.entries({
  runtime_no_src_mjs: checks.runtime_no_src_mjs,
  runtime_ts_source_of_truth: checks.runtime_ts_source_of_truth,
  runtime_dist_parity: checks.runtime_dist_parity,
  route_proof_artifact_structure: checks.route_proof_artifact_structure,
  agent_codex_app_cockpit: checks.agent_codex_app_cockpit,
  agent_janitor: checks.agent_janitor,
  agent_multi_project_isolation: checks.agent_multi_project_isolation,
  verification_parallel_engine: checks.verification_parallel_engine,
  release_metadata: checks.release_metadata,
  release_readiness: checks.release_readiness,
  xai_mcp_capability: checks.xai_mcp_capability,
  source_intelligence_policy: checks.source_intelligence_policy,
  source_intelligence_all_modes: checks.source_intelligence_all_modes,
  codex_web_adapter: checks.codex_web_adapter,
  goal_mode_official_default: checks.goal_mode_official_default,
  agent_main_no_scout: checks.agent_main_no_scout,
  agent_worker_scout_limited: checks.agent_worker_scout_limited,
  agent_background_terminals: checks.agent_background_terminals,
  agent_zellij_runtime: checks.agent_zellij_runtime,
  agent_task_graph_expansion: checks.agent_task_graph_expansion,
  agent_follow_up_work_schema: checks.agent_follow_up_work_schema,
  agent_dynamic_pool_route_blackbox: checks.agent_dynamic_pool_route_blackbox,
  agent_backfill_route_blackbox: checks.agent_backfill_route_blackbox,
  agent_cli_options_to_task_graph: checks.agent_cli_options_to_task_graph,
  agent_route_truth_backfill: checks.agent_route_truth_backfill,
  team_backfill_route_blackbox: checks.team_backfill_route_blackbox,
  team_actual_route_backfill: checks.team_actual_route_backfill,
  research_backfill_route_blackbox: checks.research_backfill_route_blackbox,
  research_actual_route_backfill: checks.research_actual_route_backfill,
  qa_backfill_route_blackbox: checks.qa_backfill_route_blackbox,
  qa_actual_route_backfill: checks.qa_actual_route_backfill,
  zellij_layout_valid: checks.zellij_layout_valid,
  zellij_lane_renderer_parallel: checks.zellij_lane_renderer_parallel,
  zellij_pane_proof_parallel: checks.zellij_pane_proof_parallel,
  zellij_screen_proof_parallel: checks.zellij_screen_proof_parallel,
  agent_proof_contract_reconciled: checks.agent_proof_contract_reconciled,
  agent_scheduler_proof_hardening: checks.agent_scheduler_proof_hardening,
  agent_dynamic_pool: checks.agent_dynamic_pool,
  agent_backfill_replenishment: checks.agent_backfill_replenishment,
  agent_scheduler_proof: checks.agent_scheduler_proof,
  agent_session_generation: checks.agent_session_generation,
  agent_terminal_generations: checks.agent_terminal_generations,
  agent_zellij_runtime_parallel: checks.agent_zellij_runtime_parallel,
  zellij_pane_lifecycle: checks.zellij_pane_lifecycle,
  zellij_physical_proof: checks.zellij_physical_proof,
  agent_cleanup_executor: checks.agent_cleanup_executor,
  agent_cleanup_executor_v2: checks.agent_cleanup_executor_v2,
  agent_cleanup_command_ux: checks.agent_cleanup_command_ux,
  retention_cleanup_safety: checks.retention_cleanup_safety && runtimeChecks.retention_cleanup_safety,
  agent_intelligent_work_graph: checks.agent_intelligent_work_graph,
  agent_ast_aware_work_graph: checks.agent_ast_aware_work_graph,
  proof_fake_vs_real_policy: checks.proof_fake_vs_real_policy,
  proof_fake_real_policy_v2: checks.proof_fake_real_policy_v2,
  release_runtime_truth_matrix: checks.release_runtime_truth_matrix && runtimeChecks.runtime_truth_matrix,
  codex_0134_compat: checks.codex_0134_compat && runtimeReports.codex_0_134_official_compat?.ok === true,
  codex_0134_official_compat: checks.codex_0134_official_compat && runtimeReports.codex_0_134_official_compat?.ok === true,
  codex_profile_primary: checks.codex_profile_primary,
  codex_managed_proxy_env: checks.codex_managed_proxy_env,
  codex_0134_runner_truth: checks.codex_0134_runner_truth && (!runtimeReports.codex_0_134_runner_truth || runtimeReports.codex_0_134_runner_truth.ok === true),
  real_codex_patch_envelope_smoke: checks.real_codex_patch_envelope_smoke && runtimeChecks.real_codex_patch_envelope_smoke,
  mcp_0134_modernization: checks.mcp_0134_modernization && runtimeReports.mcp_0_134_modernization?.ok === true,
  mcp_readonly_runtime_scheduler: checks.mcp_readonly_runtime_scheduler && (!runtimeReports.mcp_readonly_runtime_scheduler || runtimeReports.mcp_readonly_runtime_scheduler.ok === true),
  appshots_thread_attachment_discovery: checks.appshots_thread_attachment_discovery && (!runtimeReports.appshots_thread_attachment_discovery || runtimeReports.appshots_thread_attachment_discovery.ok === true),
  source_intelligence_codex_history_search: checks.source_intelligence_codex_history_search,
  agent_parallel_write_kernel: checks.agent_parallel_write_kernel && runtimeReports.agent_parallel_write_kernel?.ok === true,
  agent_parallel_write_blackbox: checks.agent_parallel_write_blackbox && runtimeReports.agent_parallel_write_blackbox?.ok === true,
  team_parallel_write_blackbox: checks.team_parallel_write_blackbox && runtimeReports.team_parallel_write_blackbox?.ok === true,
  dfix_parallel_write_blackbox: checks.dfix_parallel_write_blackbox && runtimeReports.dfix_parallel_write_blackbox?.ok === true,
  agent_patch_envelope_extraction: checks.agent_patch_envelope_extraction && runtimeReports.agent_patch_envelope_extraction?.ok === true,
  agent_patch_queue_runtime: checks.agent_patch_queue_runtime && runtimeReports.agent_patch_queue_runtime?.ok === true,
  agent_strategy_to_lease_wiring: checks.agent_strategy_to_lease_wiring && runtimeReports.agent_strategy_to_lease_wiring?.ok === true,
  agent_patch_swarm_runtime: checks.agent_patch_swarm_runtime && runtimeReports.agent_patch_swarm_runtime?.ok === true,
  agent_patch_swarm_runtime_truth: checks.agent_patch_swarm_runtime_truth && runtimeReports.agent_patch_swarm_runtime_truth?.ok === true,
  agent_patch_transaction_journal: checks.agent_patch_transaction_journal && runtimeReports.agent_patch_transaction_journal?.ok === true,
  agent_patch_conflict_rebase: checks.agent_patch_conflict_rebase && runtimeReports.agent_patch_conflict_rebase?.ok === true,
  agent_strategy_to_patch_strict: checks.agent_strategy_to_patch_strict && runtimeReports.agent_strategy_to_patch_strict?.ok === true,
  agent_rollback_command: checks.agent_rollback_command && runtimeReports.agent_rollback_command?.ok === true,
  agent_native_cli_session_swarm: checks.agent_native_cli_session_swarm && runtimeReports.agent_native_cli_session_swarm?.ok === true,
  agent_native_cli_session_swarm_10: checks.agent_native_cli_session_swarm_10 && runtimeReports.agent_native_cli_session_swarm_10?.ok === true,
  agent_native_cli_session_swarm_20: checks.agent_native_cli_session_swarm_20 && runtimeReports.agent_native_cli_session_swarm_20?.ok === true,
  agent_no_subagent_scaling: checks.agent_no_subagent_scaling && runtimeReports.agent_no_subagent_scaling?.ok === true,
  agent_native_cli_session_proof: checks.agent_native_cli_session_proof && runtimeReports.agent_native_cli_session_proof?.ok === true,
  agent_worker_backend_router: checks.agent_worker_backend_router && runtimeReports.agent_worker_backend_router?.ok === true,
  agent_codex_child_overlap: checks.agent_codex_child_overlap && runtimeReports.agent_codex_child_overlap?.ok === true,
  agent_model_authored_patch_envelope: checks.agent_model_authored_patch_envelope && runtimeReports.agent_model_authored_patch_envelope?.ok === true,
  zellij_pane_proof: checks.zellij_pane_proof && runtimeReports.zellij_pane_proof?.ok === true,
  zellij_screen_proof: checks.zellij_screen_proof && runtimeReports.zellij_screen_proof?.ok === true,
  zellij_lane_renderer: checks.zellij_lane_renderer && runtimeReports.zellij_lane_renderer?.ok === true,
  mad_sks_zellij_launch: checks.mad_sks_zellij_launch && runtimeReports.mad_sks_zellij_launch?.ok === true,
  agent_fast_mode_default: checks.agent_fast_mode_default && runtimeReports.agent_fast_mode_default?.ok === true,
  agent_fast_mode_worker_propagation: checks.agent_fast_mode_worker_propagation && runtimeReports.agent_fast_mode_worker_propagation?.ok === true,
  codex_fast_mode_profile_propagation: checks.codex_fast_mode_profile_propagation && runtimeReports.codex_fast_mode_profile_propagation?.ok === true,
  mad_sks_fast_mode_propagation: checks.mad_sks_fast_mode_propagation && runtimeReports.mad_sks_fast_mode_propagation?.ok === true,
  agent_patch_verification_dag: checks.agent_patch_verification_dag && runtimeReports.agent_patch_verification_dag?.ok === true,
  agent_patch_rollback_dag: checks.agent_patch_rollback_dag && runtimeReports.agent_patch_rollback_dag?.ok === true,
  agent_patch_proof_runtime: checks.agent_patch_proof_runtime && runtimeReports.agent_patch_proof_runtime?.ok === true,
  agent_patch_swarm_route_blackbox: checks.agent_patch_swarm_route_blackbox && runtimeReports.agent_patch_swarm_route_blackbox?.ok === true,
  team_patch_swarm_route_blackbox: checks.team_patch_swarm_route_blackbox && runtimeReports.team_patch_swarm_route_blackbox?.ok === true,
  dfix_patch_swarm_route_blackbox: checks.dfix_patch_swarm_route_blackbox && runtimeReports.dfix_patch_swarm_route_blackbox?.ok === true,
  agent_patch_proof: checks.agent_patch_proof && runtimeReports.agent_patch_proof?.ok === true,
  agent_patch_rollback: checks.agent_patch_rollback && runtimeReports.agent_patch_rollback?.ok === true,
  release_gate_existence_audit: checks.release_gate_existence_audit,
  route_blackbox_realism: checks.route_blackbox_realism,
  agent_dynamic_cockpit: checks.agent_dynamic_cockpit,
  agent_source_intelligence_propagation: checks.agent_source_intelligence_propagation,
  agent_goal_mode_propagation: checks.agent_goal_mode_propagation,
  agent_visual_consistency: checks.agent_visual_consistency,
  release_parallel_full_coverage: checks.release_parallel_full_coverage,
  priority_full_closure: checks.priority_full_closure
})) if (!ok) remainingP0.push(`${name}_gate_missing`);
if (docs.status !== 0) remainingP0.push('docs_truthfulness_failed');
if (officialDocs.status !== 0) remainingP0.push('official_docs_compat_failed');
if (releaseMetadata.status !== 0) remainingP0.push('release_metadata_failed');
if (sideEffectRuntime.status !== 0) remainingP0.push('side_effect_runtime_report_failed');
if (releaseProvenance.status !== 0) remainingP0.push('release_provenance_failed');
if (imagegenCore.status !== 0) remainingP0.push('imagegen_core_capability_failed');

const stamp = readJson('.sneakoscope/reports/release-check-stamp.json', null);
const stampVerify = spawnSync(process.execPath, ['scripts/release-check-stamp.mjs', 'verify'], {
  cwd: root,
  encoding: 'utf8',
  env: { ...process.env, CI: 'true' },
  timeout: 30_000
});
const currentStamp = stampVerify.status === 0 && stamp?.package_version === RELEASE_VERSION ? stamp : null;
if (stampVerify.status !== 0 && !dynamicReleaseMode) remainingP0.push('release_check_stamp_stale_or_missing');
const report = {
  schema: 'sks.release-readiness.v1',
  generated_at: new Date().toISOString(),
  scope: {
    release_version: RELEASE_VERSION,
    gate: `${RELEASE_VERSION} route-truth dynamic scheduler closure DAG`,
    ok_means: `no remaining ${RELEASE_VERSION} dynamic scheduler, task graph, follow-up, Zellij lane, route blackbox, source, or Goal propagation gaps`,
    not_in_1_18_parallel_gate: `reported for historical, live, or broader gates that are not part of the ${RELEASE_VERSION} closure DAG`
  },
  package: {
    name: pkg.name,
    version: pkg.version
  },
  hook_strict_subset: {
    status: checks.hook_strict_subset ? 'present' : 'missing'
  },
  codex_lb_setup_truthfulness: {
    status: checks.codex_lb_persistence_truth ? 'present' : 'missing',
    persistence_modes: ['durable_env_file', 'durable_keychain', 'durable_launchctl', 'shell_profile', 'process_only_ephemeral']
  },
  computer_use_evidence_mode_support: {
    status: checks.computer_use_live_evidence ? 'present' : 'missing',
    modes: ['probe_only', 'live_capture_attempted', 'live_capture_success', 'live_capture_blocked']
  },
  imagegen_core: {
    status: imagegenCore.status === 0 ? 'pass' : 'fail',
    model: 'gpt-image-2',
    required_for_full_visual_verification: true,
    preferred_surface: 'Codex App $imagegen',
    codex_app_builtin_required: true,
    real_output_verified_by_capability_check: false,
    capability_detection_is_not_output_proof: true,
    fallback_surface: 'Explicit OpenAI Images API gpt-image-2 fallback (non-Codex evidence)',
    api_fallback_satisfies_codex_app_evidence: false,
    stdout: trimOutput(imagegenCore.stdout)
  },
  codex_0_133: {
    status: checks.codex_0133_compat ? 'present' : 'missing',
    baseline: 'rust-v0.133.0',
    output_schema_resume: checks.codex_output_schema_fixture ? 'present' : 'missing'
  },
  codex_0_134: {
    status: checks.codex_0134_compat
      && checks.codex_0134_official_compat
      && runtimeReports.codex_0_134_official_compat?.ok === true
      && checks.codex_profile_primary
      && checks.codex_managed_proxy_env
      && checks.codex_0134_runner_truth
      && checks.source_intelligence_codex_history_search ? 'present' : 'missing',
    baseline: 'rust-v0.134.0',
    official_compat: checks.codex_0134_official_compat,
    official_compat_report_ok: runtimeReports.codex_0_134_official_compat ? runtimeReports.codex_0_134_official_compat.ok === true : null,
    profile_primary: checks.codex_profile_primary,
    managed_proxy_env: checks.codex_managed_proxy_env,
	    runner_truth: checks.codex_0134_runner_truth,
	    runner_truth_report_ok: runtimeReports.codex_0_134_runner_truth ? runtimeReports.codex_0_134_runner_truth.ok === true : null,
	    real_patch_envelope_smoke: checks.real_codex_patch_envelope_smoke,
	    real_patch_envelope_smoke_report_ok: runtimeReports.real_codex_patch_envelope_smoke ? runtimeReports.real_codex_patch_envelope_smoke.ok === true : null,
	    real_patch_envelope_smoke_proof_level: runtimeReports.real_codex_patch_envelope_smoke?.proof_level || null,
	    local_history_search: checks.source_intelligence_codex_history_search
	  },
	  real_codex_patch_envelope_smoke_1_18_11: {
	    status: checks.real_codex_patch_envelope_smoke && runtimeChecks.real_codex_patch_envelope_smoke ? 'present' : 'missing',
	    gate: 'agent:real-codex-patch-envelope-smoke',
	    report: '.sneakoscope/reports/agent-real-codex-patch-envelope-smoke.json',
	    proof_level: runtimeReports.real_codex_patch_envelope_smoke?.proof_level || null,
	    required: runtimeReports.real_codex_patch_envelope_smoke?.required === true,
	    next_action: runtimeReports.real_codex_patch_envelope_smoke?.proof_level === 'integration_optional'
	      ? 'Run SKS_TEST_REAL_CODEX_PATCHES=1 npm run agent:real-codex-patch-envelope-smoke for live Codex patch evidence; add SKS_REQUIRE_REAL_CODEX_PATCHES=1 when release policy requires it.'
	      : null
	  },
  mcp_0_134: {
    status: checks.mcp_0134_modernization
      && runtimeReports.mcp_0_134_modernization?.ok === true
      && checks.mcp_readonly_runtime_scheduler ? 'present' : 'missing',
    modernization_gate: checks.mcp_0134_modernization,
    modernization_report_ok: runtimeReports.mcp_0_134_modernization ? runtimeReports.mcp_0_134_modernization.ok === true : null,
    readonly_runtime_scheduler: checks.mcp_readonly_runtime_scheduler,
    readonly_runtime_scheduler_report_ok: runtimeReports.mcp_readonly_runtime_scheduler ? runtimeReports.mcp_readonly_runtime_scheduler.ok === true : null
  },
  parallel_write_kernel_1_18_9: {
    status: checks.agent_parallel_write_kernel
      && checks.agent_parallel_write_blackbox
      && checks.team_parallel_write_blackbox
      && checks.dfix_parallel_write_blackbox
      && checks.agent_patch_proof
      && checks.agent_patch_rollback
      && runtimeReports.agent_parallel_write_kernel?.ok === true
      && runtimeReports.agent_parallel_write_blackbox?.ok === true
      && runtimeReports.team_parallel_write_blackbox?.ok === true
      && runtimeReports.dfix_parallel_write_blackbox?.ok === true
      && runtimeReports.agent_patch_proof?.ok === true
      && runtimeReports.agent_patch_rollback?.ok === true ? 'present' : 'missing',
    agent_parallel_write_kernel: checks.agent_parallel_write_kernel,
    agent_parallel_write_blackbox: checks.agent_parallel_write_blackbox,
    team_parallel_write_blackbox: checks.team_parallel_write_blackbox,
    dfix_parallel_write_blackbox: checks.dfix_parallel_write_blackbox,
    agent_patch_proof: checks.agent_patch_proof,
    agent_patch_rollback: checks.agent_patch_rollback,
    kernel_report_ok: runtimeReports.agent_parallel_write_kernel ? runtimeReports.agent_parallel_write_kernel.ok === true : null,
    agent_blackbox_report_ok: runtimeReports.agent_parallel_write_blackbox ? runtimeReports.agent_parallel_write_blackbox.ok === true : null,
    team_blackbox_report_ok: runtimeReports.team_parallel_write_blackbox ? runtimeReports.team_parallel_write_blackbox.ok === true : null,
    dfix_blackbox_report_ok: runtimeReports.dfix_parallel_write_blackbox ? runtimeReports.dfix_parallel_write_blackbox.ok === true : null,
    proof_report_ok: runtimeReports.agent_patch_proof ? runtimeReports.agent_patch_proof.ok === true : null,
    rollback_report_ok: runtimeReports.agent_patch_rollback ? runtimeReports.agent_patch_rollback.ok === true : null
  },
  patch_swarm_runtime_1_18_9: {
    status: checks.agent_patch_envelope_extraction
      && checks.agent_patch_queue_runtime
      && checks.agent_strategy_to_lease_wiring
      && checks.agent_patch_swarm_runtime
      && checks.agent_patch_swarm_runtime_truth
      && checks.agent_patch_transaction_journal
      && checks.agent_patch_conflict_rebase
      && checks.agent_strategy_to_patch_strict
      && checks.agent_rollback_command
      && checks.agent_patch_verification_dag
      && checks.agent_patch_rollback_dag
      && checks.agent_patch_proof_runtime
      && checks.agent_patch_swarm_route_blackbox
      && checks.team_patch_swarm_route_blackbox
      && checks.dfix_patch_swarm_route_blackbox
      && runtimeReports.agent_patch_envelope_extraction?.ok === true
      && runtimeReports.agent_patch_queue_runtime?.ok === true
      && runtimeReports.agent_strategy_to_lease_wiring?.ok === true
      && runtimeReports.agent_patch_swarm_runtime?.ok === true
      && runtimeReports.agent_patch_swarm_runtime_truth?.ok === true
      && runtimeReports.agent_patch_transaction_journal?.ok === true
      && runtimeReports.agent_patch_conflict_rebase?.ok === true
      && runtimeReports.agent_strategy_to_patch_strict?.ok === true
      && runtimeReports.agent_rollback_command?.ok === true
      && runtimeReports.agent_patch_verification_dag?.ok === true
      && runtimeReports.agent_patch_rollback_dag?.ok === true
      && runtimeReports.agent_patch_proof_runtime?.ok === true
      && runtimeReports.agent_patch_swarm_route_blackbox?.ok === true
      && runtimeReports.team_patch_swarm_route_blackbox?.ok === true
      && runtimeReports.dfix_patch_swarm_route_blackbox?.ok === true ? 'present' : 'missing',
    envelope_extraction_report_ok: runtimeReports.agent_patch_envelope_extraction ? runtimeReports.agent_patch_envelope_extraction.ok === true : null,
    queue_runtime_report_ok: runtimeReports.agent_patch_queue_runtime ? runtimeReports.agent_patch_queue_runtime.ok === true : null,
    strategy_to_lease_report_ok: runtimeReports.agent_strategy_to_lease_wiring ? runtimeReports.agent_strategy_to_lease_wiring.ok === true : null,
    swarm_runtime_report_ok: runtimeReports.agent_patch_swarm_runtime ? runtimeReports.agent_patch_swarm_runtime.ok === true : null,
    swarm_runtime_truth_report_ok: runtimeReports.agent_patch_swarm_runtime_truth ? runtimeReports.agent_patch_swarm_runtime_truth.ok === true : null,
    transaction_journal_report_ok: runtimeReports.agent_patch_transaction_journal ? runtimeReports.agent_patch_transaction_journal.ok === true : null,
    conflict_rebase_report_ok: runtimeReports.agent_patch_conflict_rebase ? runtimeReports.agent_patch_conflict_rebase.ok === true : null,
    strategy_to_patch_strict_report_ok: runtimeReports.agent_strategy_to_patch_strict ? runtimeReports.agent_strategy_to_patch_strict.ok === true : null,
    rollback_command_report_ok: runtimeReports.agent_rollback_command ? runtimeReports.agent_rollback_command.ok === true : null,
    verification_dag_report_ok: runtimeReports.agent_patch_verification_dag ? runtimeReports.agent_patch_verification_dag.ok === true : null,
    rollback_dag_report_ok: runtimeReports.agent_patch_rollback_dag ? runtimeReports.agent_patch_rollback_dag.ok === true : null,
    proof_runtime_report_ok: runtimeReports.agent_patch_proof_runtime ? runtimeReports.agent_patch_proof_runtime.ok === true : null,
    agent_route_blackbox_ok: runtimeReports.agent_patch_swarm_route_blackbox ? runtimeReports.agent_patch_swarm_route_blackbox.ok === true : null,
    team_route_blackbox_ok: runtimeReports.team_patch_swarm_route_blackbox ? runtimeReports.team_patch_swarm_route_blackbox.ok === true : null,
    dfix_route_blackbox_ok: runtimeReports.dfix_patch_swarm_route_blackbox ? runtimeReports.dfix_patch_swarm_route_blackbox.ok === true : null
  },
  native_cli_session_swarm_1_18_10: {
    status: checks.agent_native_cli_session_swarm
      && checks.agent_native_cli_session_swarm_10
      && checks.agent_native_cli_session_swarm_20
      && checks.agent_no_subagent_scaling
      && checks.agent_native_cli_session_proof
      && runtimeReports.agent_native_cli_session_swarm?.ok === true
      && runtimeReports.agent_native_cli_session_swarm_10?.ok === true
      && runtimeReports.agent_native_cli_session_swarm_20?.ok === true
      && runtimeReports.agent_no_subagent_scaling?.ok === true
      && runtimeReports.agent_native_cli_session_proof?.ok === true ? 'present' : 'missing',
    swarm_5_report_ok: runtimeReports.agent_native_cli_session_swarm ? runtimeReports.agent_native_cli_session_swarm.ok === true : null,
    swarm_10_report_ok: runtimeReports.agent_native_cli_session_swarm_10 ? runtimeReports.agent_native_cli_session_swarm_10.ok === true : null,
    swarm_20_report_ok: runtimeReports.agent_native_cli_session_swarm_20 ? runtimeReports.agent_native_cli_session_swarm_20.ok === true : null,
    no_subagent_scaling_report_ok: runtimeReports.agent_no_subagent_scaling ? runtimeReports.agent_no_subagent_scaling.ok === true : null,
    native_cli_session_proof_report_ok: runtimeReports.agent_native_cli_session_proof ? runtimeReports.agent_native_cli_session_proof.ok === true : null,
    max_observed_10: runtimeReports.agent_native_cli_session_swarm_10?.native_cli_session_proof?.max_observed_worker_process_count || null,
    max_observed_20: runtimeReports.agent_native_cli_session_swarm_20?.native_cli_session_proof?.max_observed_worker_process_count || null
  },
  real_codex_parallel_workers_1_18_11: {
    status: checks.agent_worker_backend_router
      && checks.agent_codex_child_overlap
      && checks.agent_model_authored_patch_envelope
      && checks.zellij_pane_proof
      && checks.zellij_screen_proof
      && checks.zellij_lane_renderer
      && checks.mad_sks_zellij_launch
      && runtimeReports.agent_worker_backend_router?.ok === true
      && runtimeReports.agent_codex_child_overlap?.ok === true
      && runtimeReports.agent_model_authored_patch_envelope?.ok === true
      && runtimeReports.zellij_pane_proof?.ok === true
      && runtimeReports.zellij_screen_proof?.ok === true
      && runtimeReports.zellij_lane_renderer?.ok === true
      && runtimeReports.mad_sks_zellij_launch?.ok === true ? 'present' : 'missing',
    worker_backend_router: checks.agent_worker_backend_router,
    codex_child_overlap: checks.agent_codex_child_overlap,
    model_authored_patch_envelope: checks.agent_model_authored_patch_envelope,
    zellij_pane_proof: checks.zellij_pane_proof,
    zellij_screen_proof: checks.zellij_screen_proof,
    zellij_lane_renderer: checks.zellij_lane_renderer,
    mad_zellij_launch: checks.mad_sks_zellij_launch,
    real_codex_parallel_optional: runtimeReports.real_codex_parallel_workers?.status || null,
    real_codex_parallel_proof_level: runtimeReports.real_codex_parallel_workers?.proof_level || null
  },
  fast_mode_default_1_18_10: {
    status: checks.agent_fast_mode_default
      && checks.agent_fast_mode_worker_propagation
      && checks.codex_fast_mode_profile_propagation
      && checks.mad_sks_fast_mode_propagation
      && runtimeReports.agent_fast_mode_default?.ok === true
      && runtimeReports.agent_fast_mode_worker_propagation?.ok === true
      && runtimeReports.codex_fast_mode_profile_propagation?.ok === true
      && runtimeReports.mad_sks_fast_mode_propagation?.ok === true ? 'present' : 'missing',
    default_report_ok: runtimeReports.agent_fast_mode_default ? runtimeReports.agent_fast_mode_default.ok === true : null,
    worker_propagation_report_ok: runtimeReports.agent_fast_mode_worker_propagation ? runtimeReports.agent_fast_mode_worker_propagation.ok === true : null,
    codex_profile_report_ok: runtimeReports.codex_fast_mode_profile_propagation ? runtimeReports.codex_fast_mode_profile_propagation.ok === true : null,
    mad_sks_report_ok: runtimeReports.mad_sks_fast_mode_propagation ? runtimeReports.mad_sks_fast_mode_propagation.ok === true : null
  },
  mad_sks_actual_executor_closure: {
    status: checks.mad_sks_actual_executor
      && checks.mad_sks_file_write_executor
      && checks.mad_sks_shell_executor
      && checks.mad_sks_package_executor
      && checks.mad_sks_service_executor
      && checks.mad_sks_db_executor
      && checks.mad_sks_rollback_apply
      && checks.mad_sks_live_guard_smoke
      && checks.mad_sks_executor_proof_graph
      && checks.flagship_proof_graph_v4
      && runtimeChecks.flagship_proof_graph_v4 ? 'present' : 'missing',
    gates: {
      actual_executor_blackbox: checks.mad_sks_actual_executor,
      file_write_executor: checks.mad_sks_file_write_executor,
      shell_executor: checks.mad_sks_shell_executor,
      package_executor: checks.mad_sks_package_executor,
      service_executor: checks.mad_sks_service_executor,
      db_executor: checks.mad_sks_db_executor,
      rollback_apply: checks.mad_sks_rollback_apply,
      live_guard_smoke: checks.mad_sks_live_guard_smoke,
      executor_proof_graph: checks.mad_sks_executor_proof_graph,
      flagship_proof_graph_v4: checks.flagship_proof_graph_v4,
      flagship_proof_graph_v4_report_ok: runtimeChecks.flagship_proof_graph_v4
    }
  },
  image_ux_review: {
    status: checks.imagegen_capability && checks.gpt_image_2_request_validator && checks.ux_review_run_wires_imagegen && checks.ux_review_extract_wires_real_extractor && checks.ux_review_patch_diff_recheck && checks.ux_review_imagegen_blackbox && checks.ux_review_real_loop_fixture && checks.ux_review_generate_callouts_fixture && checks.ux_review_extract_real_callouts_fixture && checks.ux_review_patch_handoff_fixture && checks.ux_review_recapture_recheck_fixture && checks.ux_review_no_text_fallback && checks.ux_review_no_fake_callouts && checks.ux_review_image_voxel_relations ? 'present' : 'missing',
    gates: {
      image_fidelity: checks.image_fidelity_check,
      imagegen_capability: checks.imagegen_capability,
      gpt_image_2_request_validator: checks.gpt_image_2_request_validator,
      run_wires_imagegen: checks.ux_review_run_wires_imagegen,
      extract_wires_real_extractor: checks.ux_review_extract_wires_real_extractor,
      patch_diff_recheck: checks.ux_review_patch_diff_recheck,
      imagegen_blackbox: checks.ux_review_imagegen_blackbox,
      real_loop_fixture: checks.ux_review_real_loop_fixture,
      generate_callouts_fixture: checks.ux_review_generate_callouts_fixture,
      extract_real_callouts_fixture: checks.ux_review_extract_real_callouts_fixture,
      patch_handoff_fixture: checks.ux_review_patch_handoff_fixture,
      recapture_recheck_fixture: checks.ux_review_recapture_recheck_fixture,
      no_text_fallback: checks.ux_review_no_text_fallback,
      no_fake_callouts: checks.ux_review_no_fake_callouts,
      image_voxel_relations: checks.ux_review_image_voxel_relations
    }
  },
  ppt_imagegen_review: {
    status: checks.ppt_imagegen_review_fixture && checks.ppt_real_export_adapter && checks.ppt_real_imagegen_wiring && checks.ppt_reexport_rereview && checks.ppt_imagegen_blackbox && checks.ux_ppt_structured_extraction && checks.ppt_slide_export_fixture && checks.ppt_no_text_fallback && checks.ppt_no_mock_as_real && checks.ppt_issue_extraction_fixture && checks.ppt_image_voxel_relations && checks.ppt_proof_trust_fixture ? 'present' : 'missing',
    gates: {
      imagegen_review_fixture: checks.ppt_imagegen_review_fixture,
      real_export_adapter: checks.ppt_real_export_adapter,
      real_imagegen_wiring: checks.ppt_real_imagegen_wiring,
      reexport_rereview: checks.ppt_reexport_rereview,
      imagegen_blackbox: checks.ppt_imagegen_blackbox,
      structured_extraction: checks.ux_ppt_structured_extraction,
      slide_export_fixture: checks.ppt_slide_export_fixture,
      no_text_fallback: checks.ppt_no_text_fallback,
      no_mock_as_real: checks.ppt_no_mock_as_real,
      issue_extraction_fixture: checks.ppt_issue_extraction_fixture,
      image_voxel_relations: checks.ppt_image_voxel_relations,
      proof_trust_fixture: checks.ppt_proof_trust_fixture
    }
  },
  dfix: {
    status: checks.dfix_fixture && checks.dfix_fast_kernel && checks.dfix_blackbox_fast && checks.dfix_performance && checks.dfix_patch_handoff && checks.dfix_verification_recommendation && checks.dfix_verification ? 'present' : 'missing',
    gates: {
      fixture: checks.dfix_fixture,
      fast_kernel: checks.dfix_fast_kernel,
      blackbox_fast: checks.dfix_blackbox_fast,
      performance: checks.dfix_performance,
      patch_handoff: checks.dfix_patch_handoff,
      verification_recommendation: checks.dfix_verification_recommendation,
      verification: checks.dfix_verification
    }
  },
  hook_trust_warning_zero: {
    status: checks.hooks_latest_schema_check && checks.hooks_trust_state_check && checks.hooks_trust_warning_zero && checks.hooks_subagent_events_check && checks.hooks_no_unsupported_handlers && checks.hooks_actual_parity_check && checks.hooks_actual_parity_v2 && checks.hooks_official_hash_parity && checks.hooks_official_hash_oracle && checks.hooks_managed_install_fixture && checks.hooks_runtime_replay_warning_zero && checks.hooks_runtime_replay_warning_zero_v2 ? 'present' : 'missing',
    latest_schema: checks.hooks_latest_schema_check,
    trust_state: checks.hooks_trust_state_check,
    warning_zero: checks.hooks_trust_warning_zero,
    subagent_events: checks.hooks_subagent_events_check,
    no_unsupported_handlers: checks.hooks_no_unsupported_handlers,
    actual_parity_check: checks.hooks_actual_parity_check,
    actual_parity_v2: checks.hooks_actual_parity_v2,
    official_hash_parity: checks.hooks_official_hash_parity,
    official_hash_oracle: checks.hooks_official_hash_oracle,
    managed_install_fixture: checks.hooks_managed_install_fixture,
    runtime_replay_warning_zero: checks.hooks_runtime_replay_warning_zero,
    runtime_replay_warning_zero_v2: checks.hooks_runtime_replay_warning_zero_v2
  },
  extreme_stabilization_1_14_1: {
    status: checks.hooks_official_hash_oracle && checks.hooks_actual_parity_v2 && checks.hooks_runtime_replay_warning_zero_v2 && checks.ppt_full_e2e_blackbox && runtimeChecks.ppt_full_e2e_blackbox && checks.ppt_full_e2e_artifact_graph && checks.codex_0133_official_compat && checks.flagship_proof_graph_v3 && runtimeChecks.flagship_proof_graph_v3 ? 'present' : 'missing',
    hooks_official_hash_oracle: checks.hooks_official_hash_oracle,
    hooks_actual_parity_v2: checks.hooks_actual_parity_v2,
    hooks_runtime_replay_warning_zero_v2: checks.hooks_runtime_replay_warning_zero_v2,
    ppt_full_e2e_blackbox: checks.ppt_full_e2e_blackbox,
    ppt_full_e2e_blackbox_report_ok: runtimeChecks.ppt_full_e2e_blackbox,
    ppt_full_e2e_artifact_graph: checks.ppt_full_e2e_artifact_graph,
    codex_0_133_official_compat: checks.codex_0133_official_compat,
    flagship_proof_graph_v3: checks.flagship_proof_graph_v3,
    flagship_proof_graph_v3_report_ok: runtimeChecks.flagship_proof_graph_v3
  },
  mad_sks_1_16_0: {
    status: checks.flagship_proof_graph_v4 && runtimeChecks.flagship_proof_graph_v4 ? 'present' : 'missing',
    flagship_proof_graph_v4: checks.flagship_proof_graph_v4,
    flagship_proof_graph_v4_report_ok: runtimeChecks.flagship_proof_graph_v4
  },
  source_intelligence_1_18: {
    status: checks.xai_mcp_capability
      && checks.source_intelligence_policy
      && checks.source_intelligence_all_modes
      && checks.codex_web_adapter ? 'present' : 'missing',
    mode_default: 'context7_codex_web',
    xai_when_available: checks.xai_mcp_capability,
    xai_missing_fallback: checks.source_intelligence_all_modes,
    codex_web_adapter: checks.codex_web_adapter
  },
  agent_terminal_zellij_1_18: {
    status: checks.agent_main_no_scout
      && checks.agent_worker_scout_limited
      && checks.agent_background_terminals
      && checks.agent_zellij_runtime
      && checks.agent_visual_consistency ? 'present' : 'missing',
    main_no_scout: checks.agent_main_no_scout,
    worker_scout_limited: checks.agent_worker_scout_limited,
    background_terminals: checks.agent_background_terminals,
    zellij_runtime: checks.agent_zellij_runtime,
    codex_app_visual_consistency: checks.agent_visual_consistency
  },
  runtime_truth_1_18_8: {
    status: checks.zellij_pane_lifecycle
      && checks.zellij_physical_proof
      && checks.real_codex_dynamic_smoke_v2
      && checks.agent_cleanup_executor_v2
      && checks.agent_cleanup_command_ux
      && checks.retention_cleanup_safety
      && runtimeChecks.retention_cleanup_safety
      && checks.agent_ast_aware_work_graph
      && checks.proof_fake_real_policy_v2
      && checks.release_runtime_truth_matrix
      && runtimeChecks.runtime_truth_matrix ? 'present' : 'missing',
    zellij_pane_lifecycle: checks.zellij_pane_lifecycle,
    zellij_physical_proof: checks.zellij_physical_proof,
    real_codex_dynamic_smoke_v2: checks.real_codex_dynamic_smoke_v2,
    real_codex_dynamic_smoke_report_ok: runtimeChecks.real_codex_dynamic_smoke,
    cleanup_executor_v2: checks.agent_cleanup_executor_v2,
    cleanup_command_ux: checks.agent_cleanup_command_ux,
    retention_cleanup_safety: checks.retention_cleanup_safety,
    retention_cleanup_safety_report_ok: runtimeChecks.retention_cleanup_safety,
    retention_cleanup_safety_report: '.sneakoscope/reports/retention-cleanup-safety.json',
    ast_aware_work_graph: checks.agent_ast_aware_work_graph,
    fake_real_policy_v2: checks.proof_fake_real_policy_v2,
    runtime_truth_matrix: checks.release_runtime_truth_matrix,
    runtime_truth_matrix_report_ok: runtimeChecks.runtime_truth_matrix,
    proof_levels: runtimeReports.runtime_truth_matrix?.proof_levels || [],
    subsystem_rows: runtimeReports.runtime_truth_matrix?.rows || []
  },
  dynamic_agent_pool_1_18_3: {
    status: checks.agent_dynamic_pool
      && checks.agent_task_graph_expansion
      && checks.agent_follow_up_work_schema
      && checks.agent_dynamic_pool_route_blackbox
      && checks.agent_backfill_route_blackbox
      && checks.agent_cli_options_to_task_graph
      && checks.agent_route_truth_backfill
      && checks.team_backfill_route_blackbox
      && checks.team_actual_route_backfill
      && checks.research_backfill_route_blackbox
      && checks.research_actual_route_backfill
      && checks.qa_backfill_route_blackbox
      && checks.qa_actual_route_backfill
      && checks.zellij_layout_valid
      && checks.zellij_lane_renderer_parallel
      && checks.zellij_pane_proof_parallel
      && checks.zellij_screen_proof_parallel
      && checks.agent_proof_contract_reconciled
      && checks.agent_scheduler_proof_hardening
      && checks.agent_backfill_replenishment
      && checks.agent_scheduler_proof
      && checks.agent_session_generation
      && checks.agent_terminal_generations
      && checks.agent_zellij_runtime_parallel
      && checks.agent_dynamic_cockpit
      && checks.agent_source_intelligence_propagation
      && checks.agent_goal_mode_propagation ? 'present' : 'missing',
    task_graph_expansion: checks.agent_task_graph_expansion,
    follow_up_work_schema: checks.agent_follow_up_work_schema,
    dynamic_pool_route_blackbox: checks.agent_dynamic_pool_route_blackbox,
    backfill_route_blackbox: checks.agent_backfill_route_blackbox,
    cli_options_to_task_graph: checks.agent_cli_options_to_task_graph,
    route_truth_backfill: checks.agent_route_truth_backfill,
    team_backfill_route_blackbox: checks.team_backfill_route_blackbox,
    team_actual_route_backfill: checks.team_actual_route_backfill,
    research_backfill_route_blackbox: checks.research_backfill_route_blackbox,
    research_actual_route_backfill: checks.research_actual_route_backfill,
    qa_backfill_route_blackbox: checks.qa_backfill_route_blackbox,
    qa_actual_route_backfill: checks.qa_actual_route_backfill,
    zellij_layout_valid: checks.zellij_layout_valid,
    zellij_lane_renderer: checks.zellij_lane_renderer_parallel,
    zellij_pane_proof: checks.zellij_pane_proof_parallel,
    zellij_screen_proof: checks.zellij_screen_proof_parallel,
    proof_contract_reconciled: checks.agent_proof_contract_reconciled,
    scheduler_proof_hardening: checks.agent_scheduler_proof_hardening,
    dynamic_pool: checks.agent_dynamic_pool,
    backfill_replenishment: checks.agent_backfill_replenishment,
    scheduler_proof: checks.agent_scheduler_proof,
    session_generation: checks.agent_session_generation,
    terminal_generations: checks.agent_terminal_generations,
    zellij_runtime_parallel: checks.agent_zellij_runtime_parallel,
    dynamic_cockpit: checks.agent_dynamic_cockpit,
    source_intelligence_propagation: checks.agent_source_intelligence_propagation,
    goal_mode_propagation: checks.agent_goal_mode_propagation
  },
  dynamic_agent_pool_1_18: null,
  goal_mode_1_18: {
    status: checks.goal_mode_official_default ? 'present' : 'missing',
    official_default_gate: checks.goal_mode_official_default
  },
  release_full_coverage_1_18: {
    status: checks.release_parallel_full_coverage && checks.priority_full_closure ? 'present' : 'missing',
    release_parallel_full_coverage: checks.release_parallel_full_coverage,
    priority_full_closure: checks.priority_full_closure,
    priorities: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6']
  },
  release_native_agent_backend: {
    status: checks.release_native_agent_backend && checks.legacy_multiagent_removed ? 'present' : 'missing',
    backend: 'native_multi_session_agent_kernel',
    legacy_multiagent_surface: checks.legacy_multiagent_removed ? 'removed' : 'missing_removal_gate'
  },
  all_feature_completion: {
    status: checks.all_features_completion && checks.all_features_deep_completion && checks.evidence_flagship_coverage ? 'present' : 'missing',
    report_path: `.sneakoscope/reports/all-feature-completion-${RELEASE_VERSION}.json`
  },
  json_schema_recursive: {
    status: checks.json_schema_recursive_check ? 'present' : 'missing'
  },
  official_docs_compatibility: {
    status: officialDocs.status === 0 ? 'pass' : (checks.official_docs_compat ? 'fail' : 'not_in_1_18_parallel_gate'),
    report_path: `.sneakoscope/reports/official-docs-compat-${RELEASE_VERSION}.json`,
    stdout: trimOutput(officialDocs.stdout)
  },
  update_check: {
    status: checks.update_check_function_only ? 'function_only' : 'missing',
    route_required: false,
    pipeline_required: false
  },
  memory_summary_rebuild: {
    status: checks.memory_summary_rebuild_check ? 'present' : 'missing',
    schema_version: 2
  },
  loop_blocker_stop: {
    status: checks.loop_blocker_check ? 'present' : 'missing',
    repeated_blocker_threshold: 2
  },
  docs_truthfulness: {
    status: docs.status === 0 ? 'pass' : 'fail',
    stdout: trimOutput(docs.stdout)
  },
  release_metadata: {
    status: releaseMetadata.status === 0 ? 'pass' : 'fail',
    stdout: trimOutput(releaseMetadata.stdout)
  },
  side_effect_runtime: {
    status: sideEffectRuntime.status === 0 ? 'pass' : 'fail',
    report: readJson('.sneakoscope/reports/side-effect-runtime-report.json', null),
    stdout: trimOutput(sideEffectRuntime.stdout),
    stderr: trimOutput(sideEffectRuntime.stderr)
  },
  provenance: {
    status: releaseProvenance.status === 0 ? 'pass' : 'fail',
    report: readJson('.sneakoscope/reports/release-provenance.json', null),
    stdout: trimOutput(releaseProvenance.stdout),
    stderr: trimOutput(releaseProvenance.stderr)
  },
  release_gate_last_pass_stamp: currentStamp ? {
    package_version: currentStamp.package_version || null,
    generated_at: currentStamp.generated_at || null,
    source_digest: currentStamp.source_digest || null
  } : null,
  release_gate_stamp_verification: {
    status: stampVerify.status === 0 ? 'pass' : dynamicReleaseMode ? 'dynamic_deferred' : 'fail',
    dynamic_release_mode: dynamicReleaseMode,
    stdout: trimOutput(stampVerify.stdout),
    stderr: trimOutput(stampVerify.stderr)
  },
  stale_release_gate_last_pass_stamp: stamp && !currentStamp ? {
    package_version: stamp.package_version || null,
    generated_at: stamp.generated_at || null,
    ignored: true
  } : null,
  remaining_p0_gaps: remainingP0,
  ok: remainingP0.length === 0
};

for (const key of [
  'hook_strict_subset',
  'codex_lb_setup_truthfulness',
  'computer_use_evidence_mode_support',
  'imagegen_core',
  'codex_0_134',
  'codex_0_133',
  'mcp_0_134',
  'parallel_write_kernel_1_18_9',
  'patch_swarm_runtime_1_18_9',
  'native_cli_session_swarm_1_18_10',
  'real_codex_patch_envelope_smoke_1_18_11',
  'real_codex_parallel_workers_1_18_11',
  'fast_mode_default_1_18_10',
  'mad_sks_actual_executor_closure',
  'image_ux_review',
  'ppt_imagegen_review',
  'dfix',
  'hook_trust_warning_zero',
  'extreme_stabilization_1_14_1',
  'mad_sks_1_16_0',
  'source_intelligence_1_18',
  'agent_terminal_zellij_1_18',
  'runtime_truth_1_18_8',
  'dynamic_agent_pool_1_18_3',
  'goal_mode_1_18',
  'release_full_coverage_1_18',
  'release_native_agent_backend',
  'all_feature_completion',
  'json_schema_recursive',
  'memory_summary_rebuild',
  'loop_blocker_stop'
]) {
  if (report[key]?.status === 'missing') report[key].status = key.endsWith('_1_18') ? 'missing' : 'not_in_1_18_parallel_gate';
}

report.dynamic_agent_pool_1_18 = report.dynamic_agent_pool_1_18_3;

fs.mkdirSync(reportDir, { recursive: true });
fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(mdPath, renderMarkdown(report));
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;

function readJson(rel, fallback) {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch (err) {
    if (arguments.length > 1) return fallback;
    throw err;
  }
}

function scriptContains(name, needle) {
  if (name === 'release:check:parallel') {
    return String(pkg.scripts?.[name] || '').includes(needle) || releaseParallelCheckSource.includes(needle);
  }
  if (name === 'release:check') {
    return String(pkg.scripts?.[name] || '').includes(needle) || releaseParallelCheckSource.includes(needle);
  }
  if (name === 'release:real-check') {
    return String(pkg.scripts?.[name] || '').includes(needle) || releaseRealCheckSource.includes(needle);
  }
  return String(pkg.scripts?.[name] || '').includes(needle);
}

function readText(rel, fallback = '') {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8');
  } catch {
    return fallback;
  }
}

function fileContains(rel, needle) {
  try {
    return fs.readFileSync(path.join(root, rel), 'utf8').includes(needle);
  } catch {
    return false;
  }
}

function runNodeScript(rel) {
  return spawnSync(process.execPath, [rel], {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, CI: 'true' },
    timeout: 30_000
  });
}

function runNodeScriptWithOkReportCache(rel, reportRel, freshnessInputs = []) {
  const cached = readFreshOkReport(reportRel, freshnessInputs);
  if (cached) {
    return {
      status: 0,
      stdout: JSON.stringify({
        ok: true,
        cached: true,
        report: reportRel,
        generated_at: cached.generated_at || null
      }),
      stderr: ''
    };
  }
  return runNodeScript(rel);
}

function readFreshOkReport(reportRel, freshnessInputs = []) {
  const reportPath = path.join(root, reportRel);
  let report;
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  } catch {
    return null;
  }
  if (report?.ok !== true) return null;
  let reportStat;
  try {
    reportStat = fs.statSync(reportPath);
  } catch {
    return null;
  }
  for (const input of freshnessInputs) {
    try {
      if (fs.statSync(path.join(root, input)).mtimeMs > reportStat.mtimeMs) return null;
    } catch {
      return null;
    }
  }
  return report;
}

function trimOutput(text) {
  return String(text || '').slice(0, 4000);
}

function renderMarkdown(report) {
  return `# SKS ${RELEASE_VERSION} Release Readiness

- Schema: \`${report.schema}\`
- Package: \`${report.package.name}@${report.package.version}\`
- Scope: \`${report.scope.gate}\`; \`ok: true\` means ${report.scope.ok_means}.
- Hook strict subset: \`${report.hook_strict_subset.status}\`
- codex-lb persistence truth: \`${report.codex_lb_setup_truthfulness.status}\`
- Computer Use evidence modes: \`${report.computer_use_evidence_mode_support.status}\`
- Imagegen core gpt-image-2 readiness: \`${report.imagegen_core.status}\` (Codex App $imagegen required; capability detection is not output proof)
- Codex 0.134 compatibility: \`${report.codex_0_134.status}\`
- Real Codex patch envelope smoke ${RELEASE_VERSION}: \`${report.real_codex_patch_envelope_smoke_1_18_11.status}\` (${report.real_codex_patch_envelope_smoke_1_18_11.proof_level || 'not_reported'})
- Real Codex parallel workers ${RELEASE_VERSION}: \`${report.real_codex_parallel_workers_1_18_11.status}\` (${report.real_codex_parallel_workers_1_18_11.real_codex_parallel_proof_level || 'not_reported'})
- Codex 0.133 compatibility: \`${report.codex_0_133.status}\`
- MCP 0.134 modernization: \`${report.mcp_0_134.status}\`
- Parallel write kernel ${RELEASE_VERSION}: \`${report.parallel_write_kernel_1_18_9.status}\`
- Patch swarm runtime ${RELEASE_VERSION}: \`${report.patch_swarm_runtime_1_18_9.status}\`
- Native CLI Session Swarm ${RELEASE_VERSION}: \`${report.native_cli_session_swarm_1_18_10.status}\`
- Fast mode default ${RELEASE_VERSION}: \`${report.fast_mode_default_1_18_10.status}\`
- MAD-SKS actual executor closure: \`${report.mad_sks_actual_executor_closure.status}\`
- Release native agent backend: \`${report.release_native_agent_backend.status}\`
- UX-Review real callout loop gates: \`${report.image_ux_review.status}\`
- PPT imagegen review gates: \`${report.ppt_imagegen_review.status}\`
- DFix gates: \`${report.dfix.status}\`
- Hook trust warning-zero: \`${report.hook_trust_warning_zero.status}\`
- Source Intelligence 1.18: \`${report.source_intelligence_1_18.status}\`
- Agent terminal/Zellij 1.18: \`${report.agent_terminal_zellij_1_18.status}\`
- Runtime truth ${RELEASE_VERSION}: \`${report.runtime_truth_1_18_8.status}\`
- Dynamic agent pool ${RELEASE_VERSION}: \`${report.dynamic_agent_pool_1_18_3.status}\`
- Goal mode 1.18: \`${report.goal_mode_1_18.status}\`
- Release full coverage 1.18: \`${report.release_full_coverage_1_18.status}\`
- All-feature completion: \`${report.all_feature_completion.status}\`
- Recursive JSON schema check: \`${report.json_schema_recursive.status}\`
- Official docs compatibility: \`${report.official_docs_compatibility.status}\`
- Update check mode: \`${report.update_check.status}\`
- Memory summary rebuild: \`${report.memory_summary_rebuild.status}\`
- Loop blocker stop: \`${report.loop_blocker_stop.status}\`
- Docs truthfulness: \`${report.docs_truthfulness.status}\`
- Release metadata: \`${report.release_metadata.status}\`
- Side-effect runtime: \`${report.side_effect_runtime.status}\` (${report.side_effect_runtime.report?.unexpected_applied_mutations ?? 'not_reported'} unexpected applied mutations)
- Provenance: \`${report.provenance.status}\` (reviewed_ref=${report.provenance.report?.reviewed_ref || 'not_reported'}, main=${report.provenance.report?.main_version || 'unavailable'}, npm=${report.provenance.report?.npm_version || 'unavailable'}, tag=${report.provenance.report?.tag_status?.exists ? 'present' : 'missing'})
- Priority closure: P0 through P9 are tracked in the ${RELEASE_VERSION} readiness surface.
- Remaining ${RELEASE_VERSION} P0 DAG gaps: ${report.remaining_p0_gaps.length ? report.remaining_p0_gaps.join(', ') : 'None'}

\`not_in_1_18_parallel_gate\` is an explicit non-P0 status for historical, live, or broader gates not run by the ${RELEASE_VERSION} parallel DAG. Computer Use live evidence, UX-Review screenshots, and PPT generated review images remain opt-in/local-only. codex-lb process-only setup is reported as \`process_only_ephemeral\`, not durable persistence. UX-Review/PPT cannot pass from text-only critique or mock-as-real fixtures.
`;
}

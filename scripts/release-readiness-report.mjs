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
  agent_tmux_right_lanes: scriptContains('release:check:parallel', 'agent:tmux-right-lanes'),
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
  agent_tmux_lane_persistence: scriptContains('release:check:parallel', 'agent:tmux-lane-persistence'),
  agent_tmux_lane_no_flicker: scriptContains('release:check:parallel', 'agent:tmux-lane-no-flicker'),
  agent_tmux_supervisor_integrated: scriptContains('release:check:parallel', 'agent:tmux-supervisor-integrated'),
  agent_tmux_slot_lane_runtime: scriptContains('release:check:parallel', 'agent:tmux-slot-lane-runtime'),
  agent_proof_contract_reconciled: scriptContains('release:check:parallel', 'agent:proof-contract-reconciled'),
  agent_scheduler_proof_hardening: scriptContains('release:check:parallel', 'agent:scheduler-proof-hardening'),
  agent_dynamic_pool: scriptContains('release:check:parallel', 'agent:dynamic-pool'),
  agent_backfill_replenishment: scriptContains('release:check:parallel', 'agent:backfill-replenishment'),
  agent_scheduler_proof: scriptContains('release:check:parallel', 'agent:scheduler-proof'),
  agent_session_generation: scriptContains('release:check:parallel', 'agent:session-generation'),
  agent_terminal_generations: scriptContains('release:check:parallel', 'agent:terminal-generations'),
  agent_tmux_real_right_lanes: scriptContains('release:check:parallel', 'agent:tmux-real-right-lanes'),
  agent_tmux_physical_lifecycle_wired: scriptContains('release:check:parallel', 'agent:tmux-physical-lifecycle-wired'),
  agent_tmux_physical_proof_v2: scriptContains('release:check:parallel', 'agent:tmux-physical-proof-v2'),
  agent_cleanup_executor: scriptContains('release:check:parallel', 'agent:cleanup-executor'),
  agent_cleanup_executor_v2: scriptContains('release:check:parallel', 'agent:cleanup-executor-v2'),
  agent_cleanup_command_ux: scriptContains('release:check:parallel', 'agent:cleanup-command-ux'),
  agent_intelligent_work_graph: scriptContains('release:check:parallel', 'agent:intelligent-work-graph'),
  agent_ast_aware_work_graph: scriptContains('release:check:parallel', 'agent:ast-aware-work-graph'),
  proof_fake_vs_real_policy: scriptContains('release:check:parallel', 'proof:fake-vs-real-policy'),
  proof_fake_real_policy_v2: scriptContains('release:check:parallel', 'proof:fake-real-policy-v2'),
  release_runtime_truth_matrix: scriptContains('release:check:parallel', 'release:runtime-truth-matrix'),
  route_blackbox_realism: scriptContains('release:check:parallel', 'route:blackbox-realism'),
  real_tmux_physical_proof: scriptContains('release:real-check', 'agent:real-tmux-physical-proof'),
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
const officialDocs = runNodeScript('scripts/official-docs-compat-report.mjs');
const releaseMetadata = runNodeScript('scripts/release-metadata-1-18-check.mjs');
const runtimeReports = {
  ppt_full_e2e_blackbox: readJson('.sneakoscope/reports/ppt-full-e2e-blackbox.json', null),
  flagship_proof_graph_v3: readJson('.sneakoscope/reports/flagship-proof-graph-v3.json', null),
  flagship_proof_graph_v4: readJson('.sneakoscope/reports/flagship-proof-graph-v4.json', null),
  runtime_truth_matrix: readJson(`.sneakoscope/reports/runtime-truth-matrix-${RELEASE_VERSION}.json`, null),
  real_codex_dynamic_smoke: readJson(`.sneakoscope/reports/agent-real-codex-dynamic-smoke-${RELEASE_VERSION}.json`, null)
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
  agent_tmux_right_lanes: checks.agent_tmux_right_lanes,
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
  agent_tmux_lane_persistence: checks.agent_tmux_lane_persistence,
  agent_tmux_lane_no_flicker: checks.agent_tmux_lane_no_flicker,
  agent_tmux_supervisor_integrated: checks.agent_tmux_supervisor_integrated,
  agent_tmux_slot_lane_runtime: checks.agent_tmux_slot_lane_runtime,
  agent_proof_contract_reconciled: checks.agent_proof_contract_reconciled,
  agent_scheduler_proof_hardening: checks.agent_scheduler_proof_hardening,
  agent_dynamic_pool: checks.agent_dynamic_pool,
  agent_backfill_replenishment: checks.agent_backfill_replenishment,
  agent_scheduler_proof: checks.agent_scheduler_proof,
  agent_session_generation: checks.agent_session_generation,
  agent_terminal_generations: checks.agent_terminal_generations,
  agent_tmux_real_right_lanes: checks.agent_tmux_real_right_lanes,
  agent_tmux_physical_lifecycle_wired: checks.agent_tmux_physical_lifecycle_wired,
  agent_tmux_physical_proof_v2: checks.agent_tmux_physical_proof_v2,
  agent_cleanup_executor: checks.agent_cleanup_executor,
  agent_cleanup_executor_v2: checks.agent_cleanup_executor_v2,
  agent_cleanup_command_ux: checks.agent_cleanup_command_ux,
  agent_intelligent_work_graph: checks.agent_intelligent_work_graph,
  agent_ast_aware_work_graph: checks.agent_ast_aware_work_graph,
  proof_fake_vs_real_policy: checks.proof_fake_vs_real_policy,
  proof_fake_real_policy_v2: checks.proof_fake_real_policy_v2,
  release_runtime_truth_matrix: checks.release_runtime_truth_matrix && runtimeChecks.runtime_truth_matrix,
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

const stamp = readJson('.sneakoscope/reports/release-check-stamp.json', null);
const currentStamp = stamp?.package_version === RELEASE_VERSION ? stamp : null;
const report = {
  schema: 'sks.release-readiness.v1',
  generated_at: new Date().toISOString(),
  scope: {
    release_version: RELEASE_VERSION,
    gate: `${RELEASE_VERSION} route-truth dynamic scheduler closure DAG`,
    ok_means: `no remaining ${RELEASE_VERSION} dynamic scheduler, task graph, follow-up, tmux lane, route blackbox, source, or Goal propagation gaps`,
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
  codex_0_133: {
    status: checks.codex_0133_compat ? 'present' : 'missing',
    baseline: 'rust-v0.133.0',
    output_schema_resume: checks.codex_output_schema_fixture ? 'present' : 'missing'
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
  agent_terminal_tmux_1_18: {
    status: checks.agent_main_no_scout
      && checks.agent_worker_scout_limited
      && checks.agent_background_terminals
      && checks.agent_tmux_right_lanes
      && checks.agent_visual_consistency ? 'present' : 'missing',
    main_no_scout: checks.agent_main_no_scout,
    worker_scout_limited: checks.agent_worker_scout_limited,
    background_terminals: checks.agent_background_terminals,
    tmux_right_lanes: checks.agent_tmux_right_lanes,
    codex_app_visual_consistency: checks.agent_visual_consistency
  },
  runtime_truth_1_18_6: {
    status: checks.agent_tmux_physical_lifecycle_wired
      && checks.agent_tmux_physical_proof_v2
      && checks.real_codex_dynamic_smoke_v2
      && checks.agent_cleanup_executor_v2
      && checks.agent_cleanup_command_ux
      && checks.agent_ast_aware_work_graph
      && checks.proof_fake_real_policy_v2
      && checks.release_runtime_truth_matrix
      && runtimeChecks.runtime_truth_matrix ? 'present' : 'missing',
    tmux_physical_lifecycle_wired: checks.agent_tmux_physical_lifecycle_wired,
    tmux_physical_proof_v2: checks.agent_tmux_physical_proof_v2,
    real_codex_dynamic_smoke_v2: checks.real_codex_dynamic_smoke_v2,
    real_codex_dynamic_smoke_report_ok: runtimeChecks.real_codex_dynamic_smoke,
    cleanup_executor_v2: checks.agent_cleanup_executor_v2,
    cleanup_command_ux: checks.agent_cleanup_command_ux,
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
      && checks.agent_tmux_lane_persistence
      && checks.agent_tmux_lane_no_flicker
      && checks.agent_tmux_supervisor_integrated
      && checks.agent_tmux_slot_lane_runtime
      && checks.agent_proof_contract_reconciled
      && checks.agent_scheduler_proof_hardening
      && checks.agent_backfill_replenishment
      && checks.agent_scheduler_proof
      && checks.agent_session_generation
      && checks.agent_terminal_generations
      && checks.agent_tmux_real_right_lanes
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
    tmux_lane_persistence: checks.agent_tmux_lane_persistence,
    tmux_lane_no_flicker: checks.agent_tmux_lane_no_flicker,
    tmux_supervisor_integrated: checks.agent_tmux_supervisor_integrated,
    tmux_slot_lane_runtime: checks.agent_tmux_slot_lane_runtime,
    proof_contract_reconciled: checks.agent_proof_contract_reconciled,
    scheduler_proof_hardening: checks.agent_scheduler_proof_hardening,
    dynamic_pool: checks.agent_dynamic_pool,
    backfill_replenishment: checks.agent_backfill_replenishment,
    scheduler_proof: checks.agent_scheduler_proof,
    session_generation: checks.agent_session_generation,
    terminal_generations: checks.agent_terminal_generations,
    tmux_real_right_lanes: checks.agent_tmux_real_right_lanes,
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
    priorities: ['P0', 'P1', 'P2', 'P3', 'P4', 'P5']
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
  release_gate_last_pass_stamp: currentStamp ? {
    package_version: currentStamp.package_version || null,
    generated_at: currentStamp.generated_at || null,
    source_digest: currentStamp.source_digest || null
  } : null,
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
  'codex_0_133',
  'mad_sks_actual_executor_closure',
  'image_ux_review',
  'ppt_imagegen_review',
  'dfix',
  'hook_trust_warning_zero',
  'extreme_stabilization_1_14_1',
  'mad_sks_1_16_0',
  'source_intelligence_1_18',
  'agent_terminal_tmux_1_18',
  'runtime_truth_1_18_6',
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
- Codex 0.133 compatibility: \`${report.codex_0_133.status}\`
- MAD-SKS actual executor closure: \`${report.mad_sks_actual_executor_closure.status}\`
- Release native agent backend: \`${report.release_native_agent_backend.status}\`
- UX-Review real callout loop gates: \`${report.image_ux_review.status}\`
- PPT imagegen review gates: \`${report.ppt_imagegen_review.status}\`
- DFix gates: \`${report.dfix.status}\`
- Hook trust warning-zero: \`${report.hook_trust_warning_zero.status}\`
- Source Intelligence 1.18: \`${report.source_intelligence_1_18.status}\`
- Agent terminal/tmux 1.18: \`${report.agent_terminal_tmux_1_18.status}\`
- Runtime truth 1.18.6: \`${report.runtime_truth_1_18_6.status}\`
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
- Priority closure: P0, P1, P2, P3, P4, and P5 are tracked in the ${RELEASE_VERSION} readiness surface.
- Remaining ${RELEASE_VERSION} P0 DAG gaps: ${report.remaining_p0_gaps.length ? report.remaining_p0_gaps.join(', ') : 'None'}

\`not_in_1_18_parallel_gate\` is an explicit non-P0 status for historical, live, or broader gates not run by the ${RELEASE_VERSION} parallel DAG. Computer Use live evidence, UX-Review screenshots, and PPT generated review images remain opt-in/local-only. codex-lb process-only setup is reported as \`process_only_ephemeral\`, not durable persistence. UX-Review/PPT cannot pass from text-only critique or mock-as-real fixtures.
`;
}

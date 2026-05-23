#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkg = readJson('package.json');
const reportDir = path.join(root, '.sneakoscope', 'reports');
const RELEASE_VERSION = '1.14.1';
const jsonPath = path.join(reportDir, `release-readiness-${RELEASE_VERSION}.json`);
const mdPath = path.join(reportDir, `release-readiness-${RELEASE_VERSION}.md`);

const checks = {
  hook_strict_subset: scriptContains('release:check', 'hooks:strict-subset-check'),
  hooks_official_hash_oracle: scriptContains('release:check', 'hooks:official-hash-oracle'),
  hooks_actual_parity_v2: scriptContains('release:check', 'hooks:actual-parity-v2'),
  hooks_runtime_replay_warning_zero_v2: scriptContains('release:check', 'hooks:runtime-replay-warning-zero-v2'),
  ppt_full_e2e_blackbox: scriptContains('release:check', 'ppt:full-e2e-blackbox'),
  ppt_full_e2e_artifact_graph: scriptContains('release:check', 'ppt:full-e2e-artifact-graph'),
  codex_0133_official_compat: scriptContains('release:check', 'codex:0.133-official-compat'),
  flagship_proof_graph_v2: scriptContains('release:check', 'flagship:proof-graph-v2'),
  scouts_multisession_artifact_graph: scriptContains('release:check', 'scouts:multisession-artifact-graph'),
  scouts_benchmark_isolation: scriptContains('release:check', 'scouts:benchmark-isolation'),
  scouts_output_schema_wiring: scriptContains('release:check', 'scouts:output-schema-wiring'),
  scouts_session_lifecycle: scriptContains('release:check', 'scouts:session-lifecycle'),
  scouts_readonly_guard_v2: scriptContains('release:check', 'scouts:readonly-guard-v2'),
  scouts_no_speedup_overclaim: scriptContains('release:check', 'scouts:no-speedup-overclaim'),
  codex_lb_persistence_truth: scriptContains('release:check', 'codex-lb:persistence-truth'),
  computer_use_live_evidence: scriptContains('release:check', 'computer-use:live-evidence'),
  docs_truthfulness: scriptContains('release:check', 'docs:truthfulness'),
  release_readiness: scriptContains('release:check', 'release:readiness'),
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
  release_metadata: scriptContains('release:check', 'release:metadata'),
  memory_summary_rebuild_check: scriptContains('release:check', 'memory-summary:rebuild-check'),
  loop_blocker_check: scriptContains('release:check', 'loop-blocker:check'),
  official_docs_compat: scriptContains('release:check', 'official-docs:compat'),
  update_check_function_only: fileContains('src/core/update-check.ts', 'pipeline_required: false')
    && fileContains('src/core/update-check.ts', "mode: 'function'")
    && fileContains('src/core/hooks-runtime.ts', 'runSksUpdateCheck')
};
const docs = runNodeScript('scripts/docs-truthfulness-check.mjs');
const officialDocs = runNodeScript('scripts/official-docs-compat-report.mjs');
const releaseMetadata = runNodeScript('scripts/release-metadata-1-14-check.mjs');
const runtimeReports = {
  ppt_full_e2e_blackbox: readJson('.sneakoscope/reports/ppt-full-e2e-blackbox.json', null),
  flagship_proof_graph_v2: readJson('.sneakoscope/reports/flagship-proof-graph-v2.json', null)
};
const runtimeChecks = {
  ppt_full_e2e_blackbox: runtimeReports.ppt_full_e2e_blackbox?.ok === true
    && ['verified', 'verified_partial'].includes(String(runtimeReports.ppt_full_e2e_blackbox?.proof_status || ''))
    && runtimeReports.ppt_full_e2e_blackbox?.trust_ok === true
    && !['blocked', 'failed', 'not_verified'].includes(String(runtimeReports.ppt_full_e2e_blackbox?.trust_status || '')),
  flagship_proof_graph_v2: runtimeReports.flagship_proof_graph_v2?.ok === true
};
const remainingP0 = [];
if (pkg.version !== RELEASE_VERSION) remainingP0.push(`package_version_not_${RELEASE_VERSION}`);
for (const [name, ok] of Object.entries(checks)) if (!ok) remainingP0.push(`${name}_gate_missing`);
for (const [name, ok] of Object.entries(runtimeChecks)) if (!ok) remainingP0.push(`${name}_report_not_ok`);
if (docs.status !== 0) remainingP0.push('docs_truthfulness_failed');
if (officialDocs.status !== 0) remainingP0.push('official_docs_compat_failed');
if (releaseMetadata.status !== 0) remainingP0.push('release_metadata_failed');

const stamp = readJson('.sneakoscope/reports/release-check-stamp.json', null);
const report = {
  schema: 'sks.release-readiness.v1',
  generated_at: new Date().toISOString(),
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
    status: checks.hooks_official_hash_oracle && checks.hooks_actual_parity_v2 && checks.hooks_runtime_replay_warning_zero_v2 && checks.ppt_full_e2e_blackbox && runtimeChecks.ppt_full_e2e_blackbox && checks.ppt_full_e2e_artifact_graph && checks.codex_0133_official_compat && checks.flagship_proof_graph_v2 && runtimeChecks.flagship_proof_graph_v2 ? 'present' : 'missing',
    hooks_official_hash_oracle: checks.hooks_official_hash_oracle,
    hooks_actual_parity_v2: checks.hooks_actual_parity_v2,
    hooks_runtime_replay_warning_zero_v2: checks.hooks_runtime_replay_warning_zero_v2,
    ppt_full_e2e_blackbox: checks.ppt_full_e2e_blackbox,
    ppt_full_e2e_blackbox_report_ok: runtimeChecks.ppt_full_e2e_blackbox,
    ppt_full_e2e_artifact_graph: checks.ppt_full_e2e_artifact_graph,
    codex_0_133_official_compat: checks.codex_0133_official_compat,
    flagship_proof_graph_v2: checks.flagship_proof_graph_v2,
    flagship_proof_graph_v2_report_ok: runtimeChecks.flagship_proof_graph_v2
  },
  scout_multisession_addendum: {
    status: checks.scouts_multisession_artifact_graph && checks.scouts_benchmark_isolation && checks.scouts_output_schema_wiring && checks.scouts_session_lifecycle && checks.scouts_readonly_guard_v2 && checks.scouts_no_speedup_overclaim ? 'present' : 'missing',
    artifact_graph: checks.scouts_multisession_artifact_graph,
    benchmark_isolation: checks.scouts_benchmark_isolation,
    output_schema_wiring: checks.scouts_output_schema_wiring,
    session_lifecycle: checks.scouts_session_lifecycle,
    readonly_guard_v2: checks.scouts_readonly_guard_v2,
    no_speedup_overclaim: checks.scouts_no_speedup_overclaim
  },
  all_feature_completion: {
    status: checks.all_features_completion && checks.all_features_deep_completion && checks.evidence_flagship_coverage ? 'present' : 'missing',
    report_path: `.sneakoscope/reports/all-feature-completion-${RELEASE_VERSION}.json`
  },
  json_schema_recursive: {
    status: checks.json_schema_recursive_check ? 'present' : 'missing'
  },
  official_docs_compatibility: {
    status: checks.official_docs_compat && officialDocs.status === 0 ? 'pass' : 'fail',
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
  release_gate_last_pass_stamp: stamp ? {
    package_version: stamp.package_version || null,
    generated_at: stamp.generated_at || null,
    source_digest: stamp.source_digest || null
  } : null,
  remaining_p0_gaps: remainingP0,
  ok: remainingP0.length === 0
};

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
  return String(pkg.scripts?.[name] || '').includes(needle);
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
- Hook strict subset: \`${report.hook_strict_subset.status}\`
- codex-lb persistence truth: \`${report.codex_lb_setup_truthfulness.status}\`
- Computer Use evidence modes: \`${report.computer_use_evidence_mode_support.status}\`
- Codex 0.133 compatibility: \`${report.codex_0_133.status}\`
- UX-Review real callout loop gates: \`${report.image_ux_review.status}\`
- PPT imagegen review gates: \`${report.ppt_imagegen_review.status}\`
- DFix gates: \`${report.dfix.status}\`
- Hook trust warning-zero: \`${report.hook_trust_warning_zero.status}\`
- All-feature completion: \`${report.all_feature_completion.status}\`
- Recursive JSON schema check: \`${report.json_schema_recursive.status}\`
- Official docs compatibility: \`${report.official_docs_compatibility.status}\`
- Update check mode: \`${report.update_check.status}\`
- Memory summary rebuild: \`${report.memory_summary_rebuild.status}\`
- Loop blocker stop: \`${report.loop_blocker_stop.status}\`
- Docs truthfulness: \`${report.docs_truthfulness.status}\`
- Release metadata: \`${report.release_metadata.status}\`
- Remaining P0 gaps: ${report.remaining_p0_gaps.length ? report.remaining_p0_gaps.join(', ') : 'None'}

Computer Use live evidence, UX-Review screenshots, and PPT generated review images remain opt-in/local-only. codex-lb process-only setup is reported as \`process_only_ephemeral\`, not durable persistence. UX-Review/PPT cannot pass from text-only critique or mock-as-real fixtures.
`;
}

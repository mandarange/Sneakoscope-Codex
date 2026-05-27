import fsp from 'node:fs/promises';
import path from 'node:path';
import { createMission, findLatestMission, loadMission } from './mission.js';
import { nowIso, readJson, runProcess, writeJsonAtomic } from './fsx.js';
import { maybeFinalizeRoute } from './proof/auto-finalize.js';
import { redactSecrets } from './secret-redaction.js';
import { writeDfixErrorSignatureArtifact } from './dfix/error-signature.js';
import { lookupDfixCache, recordDfixCache } from './dfix/dfix-cache.js';
import { writeDfixPathDecisionArtifact } from './dfix/path-decision.js';
import { writeDfixRootCauseRankingArtifact } from './dfix/root-cause-ranking.js';
import { writeDfixPatchTemplateArtifact } from './dfix/patch-templates.js';
import { runDfixPatch } from './dfix/patch-runner.js';
import { writeDfixCodexHandoffArtifact } from './dfix/codex-handoff.js';
import { selectDfixVerification } from './dfix/verification-selector.js';
import { runDfixVerificationCommand } from './dfix/verification-runner.js';
import { writeDfixPerformanceReport } from './dfix/performance.js';
import { appendAgentLedgerEvent, initializeAgentCentralLedger } from './agents/agent-central-ledger.js';

export const DFIX_DIAGNOSIS_ARTIFACT = 'dfix-diagnosis.json';
export const DFIX_ROOT_CAUSE_ARTIFACT = 'dfix-root-cause.json';
export const DFIX_PATCH_PLAN_ARTIFACT = 'dfix-patch-plan.json';
export const DFIX_PATCH_RESULT_ARTIFACT = 'dfix-patch-result.json';
export const DFIX_VERIFICATION_SUGGESTION_ARTIFACT = 'dfix-verification-suggestion.json';
export const DFIX_VERIFICATION_ARTIFACT = 'dfix-verification.json';
export const DFIX_GATE_ARTIFACT = 'dfix-gate.json';
export const DFIX_ERROR_SIGNATURE_ARTIFACT = 'dfix-error-signature.json';
export const DFIX_PATH_DECISION_ARTIFACT = 'dfix-path-decision.json';
export const DFIX_ROOT_CAUSE_RANKING_ARTIFACT = 'dfix-root-cause-ranking.json';
export const DFIX_PATCH_TEMPLATE_ARTIFACT = 'dfix-patch-template.json';
export const DFIX_PATCH_RUNNER_RESULT_ARTIFACT = 'dfix-patch-runner-result.json';
export const DFIX_CODEX_HANDOFF_ARTIFACT = 'dfix-codex-handoff.json';
export const DFIX_VERIFICATION_SELECTION_ARTIFACT = 'dfix-verification-selection.json';
export const DFIX_VERIFICATION_RUNNER_ARTIFACT = 'dfix-verification-runner.json';
export const DFIX_PERFORMANCE_REPORT_ARTIFACT = 'dfix-performance-report.json';

export const DFIX_NATIVE_AGENT_PERSONAS = Object.freeze([
  {
    id: 'dfix_implementer',
    role: 'implementer',
    label: 'DFix Implementer',
    exclusive_file_lease: true,
    read_only: false,
    mandate: 'Apply the one bounded direct-fix patch only inside the explicit target file lease.',
    outputs: [DFIX_PATCH_PLAN_ARTIFACT, DFIX_PATCH_RESULT_ARTIFACT]
  },
  {
    id: 'dfix_verifier',
    role: 'verifier',
    label: 'DFix Verifier',
    test_lease: true,
    read_only: true,
    mandate: 'Run the selected verification command or record a blocker without broadening the fix.',
    outputs: [DFIX_VERIFICATION_SELECTION_ARTIFACT, DFIX_VERIFICATION_ARTIFACT, DFIX_VERIFICATION_RUNNER_ARTIFACT]
  },
  {
    id: 'dfix_safety',
    role: 'safety',
    label: 'DFix Safety Reviewer',
    read_only: true,
    reviews_risky_changes: true,
    mandate: 'Review risky changes, destructive operations, DB writes, and unrequested fallback implementation before proof.',
    outputs: [DFIX_GATE_ARTIFACT]
  }
]);

export function dfixNativeAgentPlan(input: any = {}) {
  const targetFile = input.file || null;
  return {
    schema: 'sks.dfix-native-agent-plan.v1',
    backend: 'native_multi_session_agent_kernel',
    legacy_runtime: false,
    central_ledger: 'agents/agent-events.jsonl',
    personas: DFIX_NATIVE_AGENT_PERSONAS.map((persona: any) => ({
      ...persona,
      session_id: input.missionId ? `${input.missionId}-${persona.id}` : `${persona.id}-session`
    })),
    leases: [
      { id: 'dfix-exclusive-file-lease', owner_agent_id: 'dfix_implementer', mode: 'exclusive_file_lease', path: targetFile || '<target-file-from-diagnosis>', exclusive: true },
      { id: 'dfix-test-lease', owner_agent_id: 'dfix_verifier', mode: 'test_lease', path: input.command || '<selected-verification-command>', exclusive: false },
      { id: 'dfix-safety-review-lease', owner_agent_id: 'dfix_safety', mode: 'read_only_safety_review', path: DFIX_GATE_ARTIFACT, exclusive: false }
    ],
    implementer_gets_exclusive_file_leases: true,
    verifier_gets_test_leases: true,
    safety_agent_reviews_risky_changes: true
  };
}

export const DFIX_ARTIFACT_PATHS: Record<string, string> = {
  diagnosis: DFIX_DIAGNOSIS_ARTIFACT,
  root_cause: DFIX_ROOT_CAUSE_ARTIFACT,
  patch_plan: DFIX_PATCH_PLAN_ARTIFACT,
  patch_result: DFIX_PATCH_RESULT_ARTIFACT,
  verification_suggestion: DFIX_VERIFICATION_SUGGESTION_ARTIFACT,
  verification: DFIX_VERIFICATION_ARTIFACT,
  error_signature: DFIX_ERROR_SIGNATURE_ARTIFACT,
  path_decision: DFIX_PATH_DECISION_ARTIFACT,
  root_cause_ranking: DFIX_ROOT_CAUSE_RANKING_ARTIFACT,
  patch_template: DFIX_PATCH_TEMPLATE_ARTIFACT,
  patch_runner_result: DFIX_PATCH_RUNNER_RESULT_ARTIFACT,
  codex_handoff: DFIX_CODEX_HANDOFF_ARTIFACT,
  verification_selection: DFIX_VERIFICATION_SELECTION_ARTIFACT,
  verification_runner: DFIX_VERIFICATION_RUNNER_ARTIFACT,
  performance_report: DFIX_PERFORMANCE_REPORT_ARTIFACT,
  gate: DFIX_GATE_ARTIFACT
};

export async function createDfixRun(root: string, args: any[] = []) {
  const prompt = String(args.filter((arg) => !String(arg).startsWith('--')).join(' ') || 'DFix diagnostic run');
  const { id, dir, mission } = await createMission(root, { mode: 'dfix', prompt });
  await writeJsonAtomic(path.join(dir, 'decision-contract.json'), {
    prompt: mission.prompt,
    sealed_hash: `dfix-${id}`,
    answers: {
      DFIX_SCOPE: prompt,
      DIRECT_FIX_ONLY: true,
      BROAD_IMPLEMENTATION_BLOCKED: true
    }
  });
  const fileFlagIndex = args.indexOf('--file');
  const commandFlagIndex = args.indexOf('--command');
  await writeDfixNativeAgentLedger(dir, {
    missionId: id,
    prompt,
    file: fileFlagIndex >= 0 ? args[fileFlagIndex + 1] : null,
    command: commandFlagIndex >= 0 ? args[commandFlagIndex + 1] : null
  });
  return { id, dir, mission };
}

export async function writeDfixNativeAgentLedger(dir: string, input: any = {}) {
  const missionId = input.missionId;
  if (!missionId) return null;
  const plan = dfixNativeAgentPlan(input);
  await writeJsonAtomic(path.join(dir, 'dfix-agent-plan.json'), plan);
  const root = await initializeAgentCentralLedger(dir, {
    missionId,
    route: '$DFix',
    prompt: input.prompt || '',
    roster: {
      schema: 'sks.dfix-agent-roster.v1',
      mission_id: missionId,
      backend: plan.backend,
      roster: plan.personas.map((persona: any) => ({
        id: persona.id,
        session_id: persona.session_id,
        persona_id: persona.id,
        role: persona.role,
        read_only: persona.read_only,
        output_artifacts: persona.outputs || []
      })),
      personas: plan.personas
    },
    partition: {
      slices: [
        { id: 'dfix-implementation', owner_agent_id: 'dfix_implementer', domain: 'dfix-patch', write_paths: [input.file || '<target-file-from-diagnosis>'], exclusive: true },
        { id: 'dfix-verification', owner_agent_id: 'dfix_verifier', domain: 'dfix-tests', write_paths: [DFIX_VERIFICATION_ARTIFACT], read_only: true },
        { id: 'dfix-safety', owner_agent_id: 'dfix_safety', domain: 'dfix-safety', write_paths: [DFIX_GATE_ARTIFACT], read_only: true }
      ],
      leases: plan.leases
    }
  });
  for (const lease of plan.leases) {
    await appendAgentLedgerEvent(root, {
      agent_id: lease.owner_agent_id,
      session_id: `${missionId}-${lease.owner_agent_id}`,
      event_type: 'dfix_lease_planned',
      payload: lease
    });
  }
  return plan;
}

export async function resolveDfixRun(root: string, missionArg: any = 'latest') {
  const id = !missionArg || missionArg === 'latest' ? await findLatestMission(root) : String(missionArg);
  if (!id) return null;
  return loadMission(root, id);
}

export async function writeDfixDiagnosis(root: string, dir: string, opts: any = {}) {
  const command = opts.command || null;
  const commandResult = command && opts.runCommand
    ? await runDiagnosticCommand(root, command)
    : null;
  const observed = opts.error || commandResult?.stderr_tail || commandResult?.stdout_tail || opts.prompt || 'No explicit error text provided.';
  const signature = await writeDfixErrorSignatureArtifact(dir, { ...opts, cwd: root, observed, command });
  const cache = await lookupDfixCache(root, dir, signature, opts);
  const pathDecision = await writeDfixPathDecisionArtifact(dir, { ...opts, signature });
  const diagnosis = redactSecrets({
    schema: 'sks.dfix-diagnosis.v1',
    created_at: nowIso(),
    prompt: opts.prompt || null,
    target_file: opts.file || null,
    diagnostic_command: command,
    command_result: commandResult,
    observed_failure: observed,
    error_signature: signature,
    cache_lookup: cache.schema,
    scanned_files_count: opts.file || signature.file ? 1 : 0,
    diagnosis_duration_ms: 0,
    skipped_expensive_checks: ['full_repo_scan', 'full_ast_scan', 'full_test_suite'],
    diagnosis_present: true,
    blockers: command && !opts.runCommand ? ['diagnostic_command_not_run_without_explicit_run_flag'] : []
  });
  const rootCause = {
    schema: 'sks.dfix-root-cause.v2',
    created_at: nowIso(),
    root_cause_present: true,
    root_cause: opts.rootCause || inferRootCause(observed, opts.file),
    evidence: [DFIX_DIAGNOSIS_ARTIFACT],
    confidence: opts.mock ? 0.58 : 0.72,
    path_decision: pathDecision,
    blockers: []
  };
  const ranking = await writeDfixRootCauseRankingArtifact(dir, { ...opts, signature, file: opts.file || signature.file });
  await writeJsonAtomic(path.join(dir, DFIX_DIAGNOSIS_ARTIFACT), diagnosis);
  await writeJsonAtomic(path.join(dir, DFIX_ROOT_CAUSE_ARTIFACT), rootCause);
  const verification_suggestion = await writeDfixVerificationSuggestion(root, dir, opts);
  return { diagnosis, root_cause: rootCause, root_cause_ranking: ranking, verification_suggestion, error_signature: signature, path_decision: pathDecision };
}

export async function writeDfixPatchPlan(dir: string, opts: any = {}) {
  const diagnosis = await readJson(path.join(dir, DFIX_DIAGNOSIS_ARTIFACT), {});
  const rootCause = await readJson(path.join(dir, DFIX_ROOT_CAUSE_ARTIFACT), {});
  const signature = await readJson(path.join(dir, DFIX_ERROR_SIGNATURE_ARTIFACT), {});
  const pathDecision = await writeDfixPathDecisionArtifact(dir, { ...opts, signature, confidence: rootCause.confidence });
  const template = await writeDfixPatchTemplateArtifact(dir, { ...opts, signature, error: diagnosis.observed_failure });
  const handoff = await writeDfixCodexHandoffArtifact(dir, { ...opts, signature, diagnosis: diagnosis.observed_failure, rootCause: rootCause.root_cause });
  const plan = {
    schema: 'sks.dfix-patch-plan.v2',
    created_at: nowIso(),
    patch_plan_present: true,
    path_decision: pathDecision,
    selected_template: template.selected_template,
    mode: opts.apply ? 'apply_requested' : 'dry_run',
    route_parallel_write: {
      write_mode: opts.writeMode || 'off',
      apply_patches: opts.applyPatches === true,
      dry_run_patches: opts.dryRunPatches === true,
      max_write_agents: Number(opts.maxWriteAgents || 1),
      route_level_flags_wired: true
    },
    target_file: opts.file || diagnosis.target_file || null,
    find_text_present: Boolean(opts.findText),
    replace_text_present: Boolean(opts.replaceText),
    patch_mode: opts.findText != null && opts.replaceText != null ? 'exact_find_replace' : 'codex_patch_handoff',
    codex_patch_handoff: opts.findText == null || opts.replaceText == null ? {
      mode: opts.apply ? 'apply_requested_requires_external_codex_patch' : 'dry_run',
      prompt: buildDfixCodexPatchPrompt(diagnosis, rootCause, opts),
      output_schema: {
        required: ['changed_files', 'patch_applied', 'diff_summary', 'verification_commands', 'rollback_plan'],
        forbidden_operations: ['destructive filesystem operations', 'DB writes', 'broad refactors', 'unrequested fallback implementation']
      },
      handoff_artifact: handoff
    } : null,
    root_cause: rootCause.root_cause || null,
    verification_commands: (await readJson(path.join(dir, DFIX_VERIFICATION_SUGGESTION_ARTIFACT), { suggested_commands: [] })).suggested_commands || [],
    safety: {
      direct_fix_only: true,
      destructive_operations_allowed: false,
      unrequested_fallback_implementation_blocked: true,
      rollback_required: true
    },
    steps: [
      'Confirm diagnostic evidence and root cause.',
      'Apply one bounded patch only when explicit apply options identify a target file and exact replacement.',
      'Run verification command or record verification blocker.',
      'Record rollback instructions.'
    ],
    blockers: [...(!opts.file && !diagnosis.target_file ? ['patch_target_file_missing'] : []), ...(pathDecision.blockers || [])],
    passed: Boolean(opts.file || diagnosis.target_file) && !(pathDecision.blockers || []).length
  };
  await writeJsonAtomic(path.join(dir, DFIX_PATCH_PLAN_ARTIFACT), plan);
  return plan;
}

export async function writeDfixPatchResult(root: string, dir: string, opts: any = {}) {
  const plan = await readJson(path.join(dir, DFIX_PATCH_PLAN_ARTIFACT), {});
  const runner = await runDfixPatch(root, dir, { ...opts, file: opts.file || plan.target_file || null });
  const result = {
    schema: 'sks.dfix-patch-result.v1',
    created_at: nowIso(),
    explicit_apply_opt_in: opts.apply === true,
    apply_opt_in: opts.apply === true,
    route_parallel_write: {
      write_mode: opts.writeMode || 'off',
      apply_patches: opts.applyPatches === true,
      dry_run_patches: opts.dryRunPatches === true,
      max_write_agents: Number(opts.maxWriteAgents || 1),
      route_level_flags_wired: true
    },
    patch_mode: plan.patch_mode || (opts.findText != null && opts.replaceText != null ? 'exact_find_replace' : 'codex_patch_handoff'),
    patch_result_present: true,
    patch_applied: runner.patch_applied,
    changed_files: runner.changed_files,
    git_diff_before: runner.git_diff_before,
    git_diff_after: runner.git_diff_after,
    diff_captured: true,
    no_op_reason: runner.no_op_reason,
    noop_patch_wrongness: opts.apply === true && !runner.patch_applied,
    rollback_plan: runner.rollback_plan,
    runner_artifact: DFIX_PATCH_RUNNER_RESULT_ARTIFACT,
    blockers: runner.blockers || [],
    passed: runner.passed === true
  };
  await writeJsonAtomic(path.join(dir, DFIX_PATCH_RESULT_ARTIFACT), result);
  const signature = await readJson(path.join(dir, DFIX_ERROR_SIGNATURE_ARTIFACT), null);
  if (signature) await recordDfixCache(root, signature, {
    successful_patch: result.patch_applied ? result.changed_files : null,
    failed_patch_wrongness: result.noop_patch_wrongness ? 'dfix_noop_patch' : null
  }).catch(() => null);
  return result;
}

export async function writeDfixVerification(root: string, dir: string, opts: any = {}) {
  const patchResult = await readJson(path.join(dir, DFIX_PATCH_RESULT_ARTIFACT), {});
  const suggestion = await readJson(path.join(dir, DFIX_VERIFICATION_SUGGESTION_ARTIFACT), null) || await writeDfixVerificationSuggestion(root, dir, opts);
  const command = opts.command || null;
  const selection = await selectDfixVerification(root, dir, { ...opts, changedFiles: patchResult.changed_files || [] });
  const runner = await runDfixVerificationCommand(root, dir, { ...opts, command: command || selection.fastest_sufficient_command, selection, mock: opts.mock });
  const commandResult = runner.command_result;
  const verification = redactSecrets({
    schema: 'sks.dfix-verification.v1',
    created_at: nowIso(),
    verification_present: true,
    verification_command: command || selection.fastest_sufficient_command,
    suggested_verification_commands: suggestion.suggested_commands || [],
    verification_selection: selection,
    best_safe_verification_command: suggestion.best_command || null,
    auto_run_opt_in: runner.auto_run_opt_in,
    command_result: commandResult,
    patch_applied: patchResult.patch_applied === true,
    status: runner.status,
    blockers: runner.blockers || [],
    passed: runner.passed === true
  });
  await writeJsonAtomic(path.join(dir, DFIX_VERIFICATION_ARTIFACT), verification);
  return verification;
}

export async function writeDfixGate(dir: string, opts: any = {}) {
  const diagnosis = await readJson(path.join(dir, DFIX_DIAGNOSIS_ARTIFACT), {});
  const rootCause = await readJson(path.join(dir, DFIX_ROOT_CAUSE_ARTIFACT), {});
  const plan = await readJson(path.join(dir, DFIX_PATCH_PLAN_ARTIFACT), {});
  const patchResult = await readJson(path.join(dir, DFIX_PATCH_RESULT_ARTIFACT), {});
  const verificationSuggestion = await readJson(path.join(dir, DFIX_VERIFICATION_SUGGESTION_ARTIFACT), {});
  const verification = await readJson(path.join(dir, DFIX_VERIFICATION_ARTIFACT), {});
  const pathDecision = await readJson(path.join(dir, DFIX_PATH_DECISION_ARTIFACT), {});
  const patchRunner = await readJson(path.join(dir, DFIX_PATCH_RUNNER_RESULT_ARTIFACT), {});
  const verificationSelection = await readJson(path.join(dir, DFIX_VERIFICATION_SELECTION_ARTIFACT), {});
  const performance = await writeDfixPerformanceReport(dir, {
    diagnose_cold_source_local: Number(diagnosis.diagnosis_duration_ms || 0),
    path_decision: 0,
    deterministic_patch_plan: 0,
    verification_selector: 0
  });
  const blockers = [
    ...(diagnosis.blockers || []),
    ...(rootCause.blockers || []),
    ...(pathDecision.blockers || []),
    ...(plan.blockers || []),
    ...(patchResult.blockers || []),
    ...(verification.blockers || []),
    ...(performance.warnings || [])
  ];
  const gate = {
    schema: 'sks.dfix-gate.v1',
    created_at: nowIso(),
    diagnosis_present: diagnosis.diagnosis_present === true,
    root_cause_present: rootCause.root_cause_present === true,
    patch_plan_present: plan.patch_plan_present === true,
    patch_result_present: patchResult.patch_result_present === true,
    verification_suggestion_present: Array.isArray(verificationSuggestion.suggested_commands),
    path_decision_present: pathDecision.schema === 'sks.dfix-path-decision.v1',
    patch_runner_present: patchRunner.schema === 'sks.dfix-patch-runner-result.v1',
    verification_selection_present: verificationSelection.schema === 'sks.dfix-verification-selection.v1',
    performance_report_present: performance.schema === 'sks.dfix-performance-report.v1',
    verification_present: verification.verification_present === true,
    rollback_plan_present: Array.isArray(patchResult.rollback_plan),
    noop_patch_wrongness: patchResult.noop_patch_wrongness === true,
    mock_fixture: opts.mock === true,
    blockers: [...new Set(blockers)],
    passed: false
  };
  gate.passed = gate.diagnosis_present
    && gate.root_cause_present
    && gate.patch_plan_present
    && gate.patch_result_present
    && gate.verification_present
    && verification.passed === true
    && gate.blockers.length === 0;
  await writeJsonAtomic(path.join(dir, DFIX_GATE_ARTIFACT), gate);
  return { gate, diagnosis, root_cause: rootCause, patch_plan: plan, patch_result: patchResult, verification_suggestion: verificationSuggestion, verification, path_decision: pathDecision, patch_runner: patchRunner, verification_selection: verificationSelection, performance };
}

export function dfixProofEvidence(gate: any = {}) {
  return {
    schema: 'sks.dfix-proof-evidence.v1',
    status: gate.passed ? 'verified' : gate.mock_fixture ? 'verified_partial' : 'blocked',
    diagnosis_present: gate.diagnosis_present === true,
    root_cause_present: gate.root_cause_present === true,
    patch_plan_present: gate.patch_plan_present === true,
    patch_result_present: gate.patch_result_present === true,
    verification_present: gate.verification_present === true,
    verification_suggestion_present: gate.verification_suggestion_present === true,
    path_decision_present: gate.path_decision_present === true,
    patch_runner_present: gate.patch_runner_present === true,
    verification_selection_present: gate.verification_selection_present === true,
    verification_status: gate.passed ? 'passed' : 'blocked',
    noop_patch_wrongness: gate.noop_patch_wrongness === true,
    blockers: gate.blockers || []
  };
}

export async function writeDfixVerificationSuggestion(root: string, dir: string, opts: any = {}) {
  const selection = await selectDfixVerification(root, dir, { ...opts, changedFiles: opts.changedFiles || [] });
  const pkg = await readJson(path.join(root, 'package.json'), null);
  const cargoToml = await fsp.readFile(path.join(root, 'Cargo.toml'), 'utf8').catch(() => null)
    || await fsp.readFile(path.join(root, 'crates', 'sks-core', 'Cargo.toml'), 'utf8').catch(() => null);
  const pyproject = await fsp.readFile(path.join(root, 'pyproject.toml'), 'utf8').catch(() => null);
  const suggestions: string[] = [];
  const scripts = pkg?.scripts || {};
  for (const script of ['typecheck', 'test:unit', 'test', 'lint', 'packcheck']) {
    if (scripts[script]) suggestions.push(`npm run ${script}`);
  }
  if (cargoToml) {
    suggestions.push('cargo check --manifest-path crates/sks-core/Cargo.toml');
    suggestions.push('cargo test --manifest-path crates/sks-core/Cargo.toml');
  }
  if (pyproject) {
    suggestions.push('python -m pytest');
    suggestions.push('python -m ruff check .');
    suggestions.push('python -m mypy .');
  }
  if (!suggestions.length) suggestions.push('npm test');
  const artifact = {
    schema: 'sks.dfix-verification-suggestion.v1',
    created_at: nowIso(),
    package_type: pkg ? 'node' : cargoToml ? 'rust' : pyproject ? 'python' : 'unknown',
    package_scripts_detected: Object.keys(scripts),
    suggested_commands: [...new Set([selection.fastest_sufficient_command, ...suggestions].filter(Boolean))],
    fastest_sufficient_command: selection.fastest_sufficient_command,
    best_command: selection.fastest_sufficient_command || suggestions[0],
    confidence: selection.confidence,
    expected_duration_budget_ms: selection.expected_duration_budget_ms,
    auto_run_requires_opt_in: true,
    recovery_action: opts.command ? 'Run the supplied verification command after patch result.' : 'Run the best safe verification command with `sks dfix verify --command <cmd> --json`, or pass --run/--verify-auto only when command execution is intended.'
  };
  await writeJsonAtomic(path.join(dir, DFIX_VERIFICATION_SUGGESTION_ARTIFACT), artifact);
  return artifact;
}

function buildDfixCodexPatchPrompt(diagnosis: any = {}, rootCause: any = {}, opts: any = {}) {
  return [
    'Prepare a bounded Codex patch for the DFix diagnosis.',
    `Diagnosis: ${diagnosis.observed_failure || '<missing>'}`,
    `Root cause: ${rootCause.root_cause || '<missing>'}`,
    `Target files: ${opts.file || diagnosis.target_file || '<inspect first>'}`,
    `Verification commands: ${(opts.verificationCommands || []).join(', ') || '<use dfix-verification-suggestion.json>'}`,
    'Forbidden operations: destructive filesystem operations, DB writes, migrations, auth/payment/security weakening, broad refactors, and unrequested fallback implementation.',
    'Return a patch result with changed_files, patch_applied, diff_summary, verification_commands, rollback_plan, and no_op_reason.'
  ].join('\n');
}

async function gitDiff(root: string) {
  const result = await runProcess('git', ['diff', '--'], {
    cwd: root,
    timeoutMs: 10_000,
    maxOutputBytes: 128 * 1024
  }).catch((err: unknown) => ({ stdout: '', stderr: err instanceof Error ? err.message : String(err), code: 1 }));
  return {
    captured: result.code === 0,
    stdout_tail: String(result.stdout || '').slice(-32_000),
    stderr_tail: String(result.stderr || '').slice(-4000)
  };
}

export async function finalizeDfix(root: string, missionId: string, artifacts: any, opts: any = {}) {
  return maybeFinalizeRoute(root, {
    missionId,
    route: '$DFix',
    gateFile: DFIX_GATE_ARTIFACT,
    gate: artifacts.gate,
    mock: opts.mock === true,
    statusHint: artifacts.gate?.passed ? 'verified_partial' : 'blocked',
    visualEvidence: { dfix: dfixProofEvidence(artifacts.gate) },
    artifacts: Object.keys(DFIX_ARTIFACT_PATHS).map((key) => DFIX_ARTIFACT_PATHS[key]),
    claims: [{ id: 'dfix-diagnose-plan-patch-verify-loop', status: opts.mock ? 'verified_partial' : artifacts.gate?.passed ? 'verified' : 'blocked' }],
    blockers: artifacts.gate?.blockers || [],
    command: { cmd: opts.cmd || 'sks dfix', status: artifacts.gate?.blockers?.length ? 1 : 0 }
  });
}

async function runDiagnosticCommand(root: string, command: string) {
  const result = await runProcess(process.execPath, ['-e', `const cp=require('node:child_process'); const r=cp.spawnSync(${JSON.stringify(command)}, {shell:true, cwd:${JSON.stringify(root)}, encoding:'utf8'}); process.stdout.write(r.stdout||''); process.stderr.write(r.stderr||''); process.exit(r.status||0);`], {
    cwd: root,
    timeoutMs: 120_000,
    maxOutputBytes: 128 * 1024
  });
  return redactSecrets({
    ok: result.code === 0,
    status: result.code === 0 ? 'passed' : 'failed',
    exit_code: result.code,
    stdout_tail: result.stdout.slice(-4000),
    stderr_tail: result.stderr.slice(-4000),
    timed_out: result.timedOut
  });
}

function inferRootCause(observed: any, file: any) {
  const text = String(observed || '');
  if (/ENOENT|not found|missing/i.test(text)) return `Missing file or path evidence${file ? ` around ${file}` : ''}.`;
  if (/TypeError|undefined|null/i.test(text)) return 'Runtime value shape mismatch or missing null/undefined guard.';
  if (/Assertion|Expected|actual/i.test(text)) return 'Observed behavior does not match the asserted contract.';
  return 'Root cause inferred from diagnostic evidence; requires verification before fixed claim.';
}

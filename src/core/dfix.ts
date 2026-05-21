import fsp from 'node:fs/promises';
import path from 'node:path';
import { createMission, findLatestMission, loadMission } from './mission.js';
import { nowIso, readJson, runProcess, writeJsonAtomic } from './fsx.js';
import { maybeFinalizeRoute } from './proof/auto-finalize.js';
import { redactSecrets } from './secret-redaction.js';

export const DFIX_DIAGNOSIS_ARTIFACT = 'dfix-diagnosis.json';
export const DFIX_ROOT_CAUSE_ARTIFACT = 'dfix-root-cause.json';
export const DFIX_PATCH_PLAN_ARTIFACT = 'dfix-patch-plan.json';
export const DFIX_PATCH_RESULT_ARTIFACT = 'dfix-patch-result.json';
export const DFIX_VERIFICATION_SUGGESTION_ARTIFACT = 'dfix-verification-suggestion.json';
export const DFIX_VERIFICATION_ARTIFACT = 'dfix-verification.json';
export const DFIX_GATE_ARTIFACT = 'dfix-gate.json';

export const DFIX_ARTIFACT_PATHS: Record<string, string> = {
  diagnosis: DFIX_DIAGNOSIS_ARTIFACT,
  root_cause: DFIX_ROOT_CAUSE_ARTIFACT,
  patch_plan: DFIX_PATCH_PLAN_ARTIFACT,
  patch_result: DFIX_PATCH_RESULT_ARTIFACT,
  verification_suggestion: DFIX_VERIFICATION_SUGGESTION_ARTIFACT,
  verification: DFIX_VERIFICATION_ARTIFACT,
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
  return { id, dir, mission };
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
  const diagnosis = redactSecrets({
    schema: 'sks.dfix-diagnosis.v1',
    created_at: nowIso(),
    prompt: opts.prompt || null,
    target_file: opts.file || null,
    diagnostic_command: command,
    command_result: commandResult,
    observed_failure: observed,
    diagnosis_present: true,
    blockers: command && !opts.runCommand ? ['diagnostic_command_not_run_without_explicit_run_flag'] : []
  });
  const rootCause = {
    schema: 'sks.dfix-root-cause.v1',
    created_at: nowIso(),
    root_cause_present: true,
    root_cause: opts.rootCause || inferRootCause(observed, opts.file),
    evidence: [DFIX_DIAGNOSIS_ARTIFACT],
    confidence: opts.mock ? 0.5 : 0.72,
    blockers: []
  };
  await writeJsonAtomic(path.join(dir, DFIX_DIAGNOSIS_ARTIFACT), diagnosis);
  await writeJsonAtomic(path.join(dir, DFIX_ROOT_CAUSE_ARTIFACT), rootCause);
  const verification_suggestion = await writeDfixVerificationSuggestion(root, dir, opts);
  return { diagnosis, root_cause: rootCause, verification_suggestion };
}

export async function writeDfixPatchPlan(dir: string, opts: any = {}) {
  const diagnosis = await readJson(path.join(dir, DFIX_DIAGNOSIS_ARTIFACT), {});
  const rootCause = await readJson(path.join(dir, DFIX_ROOT_CAUSE_ARTIFACT), {});
  const plan = {
    schema: 'sks.dfix-patch-plan.v1',
    created_at: nowIso(),
    patch_plan_present: true,
    mode: opts.apply ? 'apply_requested' : 'dry_run',
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
      }
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
    blockers: !opts.file && !diagnosis.target_file ? ['patch_target_file_missing'] : [],
    passed: Boolean(opts.file || diagnosis.target_file)
  };
  await writeJsonAtomic(path.join(dir, DFIX_PATCH_PLAN_ARTIFACT), plan);
  return plan;
}

export async function writeDfixPatchResult(root: string, dir: string, opts: any = {}) {
  const plan = await readJson(path.join(dir, DFIX_PATCH_PLAN_ARTIFACT), {});
  const file = opts.file || plan.target_file || null;
  const diffBefore = await gitDiff(root);
  let changed = false;
  let noOpReason: string | null = null;
  const changedFiles: string[] = [];
  if (opts.apply && file && opts.findText != null && opts.replaceText != null) {
    const absolute = path.resolve(root, file);
    const before = await fsp.readFile(absolute, 'utf8');
    if (!before.includes(String(opts.findText))) {
      noOpReason = 'find_text_not_present';
    } else {
      const after = before.split(String(opts.findText)).join(String(opts.replaceText));
      if (after === before) noOpReason = 'replacement_noop';
      else {
        await fsp.writeFile(absolute, after, 'utf8');
        changed = true;
        changedFiles.push(path.relative(root, absolute).split(path.sep).join('/'));
      }
    }
  } else {
    noOpReason = opts.apply ? 'codex_patch_handoff_requires_external_patch_runner' : 'dry_run_no_patch_applied';
  }
  const diffAfter = await gitDiff(root);
  const result = {
    schema: 'sks.dfix-patch-result.v1',
    created_at: nowIso(),
    explicit_apply_opt_in: opts.apply === true,
    apply_opt_in: opts.apply === true,
    patch_mode: plan.patch_mode || (opts.findText != null && opts.replaceText != null ? 'exact_find_replace' : 'codex_patch_handoff'),
    patch_result_present: true,
    patch_applied: changed,
    changed_files: changedFiles,
    git_diff_before: diffBefore,
    git_diff_after: diffAfter,
    diff_captured: true,
    no_op_reason: changed ? null : noOpReason,
    noop_patch_wrongness: opts.apply === true && !changed,
    rollback_plan: changedFiles.map((rel) => ({ file: rel, action: 'restore from git or apply inverse exact replacement before re-running verification' })),
    blockers: opts.apply === true && !changed ? ['dfix_noop_patch'] : [],
    passed: changed || opts.apply !== true
  };
  await writeJsonAtomic(path.join(dir, DFIX_PATCH_RESULT_ARTIFACT), result);
  return result;
}

export async function writeDfixVerification(root: string, dir: string, opts: any = {}) {
  const patchResult = await readJson(path.join(dir, DFIX_PATCH_RESULT_ARTIFACT), {});
  const suggestion = await readJson(path.join(dir, DFIX_VERIFICATION_SUGGESTION_ARTIFACT), null) || await writeDfixVerificationSuggestion(root, dir, opts);
  const command = opts.command || null;
  const shouldRun = Boolean(command && (opts.runCommand === true || opts.verifyAuto === true));
  const commandResult = shouldRun ? await runDiagnosticCommand(root, command) : null;
  const verification = redactSecrets({
    schema: 'sks.dfix-verification.v1',
    created_at: nowIso(),
    verification_present: true,
    verification_command: command,
    suggested_verification_commands: suggestion.suggested_commands || [],
    best_safe_verification_command: suggestion.best_command || null,
    auto_run_opt_in: opts.runCommand === true || opts.verifyAuto === true,
    command_result: commandResult,
    patch_applied: patchResult.patch_applied === true,
    status: commandResult ? commandResult.status : opts.mock ? 'passed' : 'blocked',
    blockers: command && !shouldRun
      ? ['verification_command_not_run_without_explicit_run_flag']
      : commandResult ? (commandResult.ok ? [] : ['verification_command_failed']) : opts.mock ? [] : ['verification_command_missing'],
    passed: commandResult ? commandResult.ok : opts.mock === true
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
  const blockers = [
    ...(diagnosis.blockers || []),
    ...(rootCause.blockers || []),
    ...(plan.blockers || []),
    ...(patchResult.blockers || []),
    ...(verification.blockers || [])
  ];
  const gate = {
    schema: 'sks.dfix-gate.v1',
    created_at: nowIso(),
    diagnosis_present: diagnosis.diagnosis_present === true,
    root_cause_present: rootCause.root_cause_present === true,
    patch_plan_present: plan.patch_plan_present === true,
    patch_result_present: patchResult.patch_result_present === true,
    verification_suggestion_present: Array.isArray(verificationSuggestion.suggested_commands),
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
  return { gate, diagnosis, root_cause: rootCause, patch_plan: plan, patch_result: patchResult, verification_suggestion: verificationSuggestion, verification };
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
    verification_status: gate.passed ? 'passed' : 'blocked',
    noop_patch_wrongness: gate.noop_patch_wrongness === true,
    blockers: gate.blockers || []
  };
}

export async function writeDfixVerificationSuggestion(root: string, dir: string, opts: any = {}) {
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
    suggested_commands: [...new Set(suggestions)],
    best_command: suggestions[0],
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
    `Target files: ${opts.file || diagnosis.target_file || '<scout first>'}`,
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
    scouts: false,
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

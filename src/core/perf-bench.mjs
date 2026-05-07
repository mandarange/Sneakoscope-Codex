import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { dirSize, fileSize, nowIso, packageRoot, runProcess, writeJsonAtomic } from './fsx.mjs';
import { buildProofField, validateProofFieldReport } from './proof-field.mjs';

export const DEFAULT_PERF_BUDGETS = {
  cli_startup_ms_p95: 250,
  route_decision_ms_p95: 75,
  context_build_ms_p95: 500,
  artifact_validation_ms_p95: 150,
  dashboard_render_ms_p95: 100,
  proof_field_build_ms_p95: 150,
  workflow_scan_ms_p95: 1000,
  fast_selftest_ms_p95: 5000,
  package_size_kb_max: 1024,
  notes: 'Package payload budget is 1024KB because the current low-dependency CLI payload is already above 512KB; reduce only with measured justification.'
};

export function percentile(values, p = 95) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[idx];
}

export async function ensurePerfBudgetFile(root) {
  const file = path.join(root, '.sneakoscope', 'perf', 'budgets.json');
  await writeJsonAtomic(file, DEFAULT_PERF_BUDGETS);
  return file;
}

export async function runPerfBench(root, opts = {}) {
  const iterations = Math.max(1, Math.min(20, Number(opts.iterations || 3)));
  const sksBin = path.join(packageRoot(), 'bin', 'sks.mjs');
  const startup = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    const result = await runProcess(process.execPath, [sksBin, 'commands', '--json'], { cwd: root, env: { SKS_DISABLE_UPDATE_CHECK: '1' }, timeoutMs: 15000, maxOutputBytes: 256 * 1024 });
    startup.push(performance.now() - t0);
    if (result.code !== 0) break;
  }
  const packageSizeKb = Math.round((await packagePayloadSize(packageRoot())) / 1024);
  const budgetFile = await ensurePerfBudgetFile(root);
  return {
    schema_version: 1,
    measured_at: nowIso(),
    iterations,
    budgets: DEFAULT_PERF_BUDGETS,
    budget_file: budgetFile,
    metrics: {
      cli_startup_ms_p95: Math.round(percentile(startup, 95)),
      package_size_kb: packageSizeKb
    },
    raw: { cli_startup_ms: startup.map((value) => Math.round(value)) }
  };
}

export async function runWorkflowPerfBench(root, opts = {}) {
  const iterations = Math.max(1, Math.min(20, Number(opts.iterations || 3)));
  const intent = String(opts.intent || '').trim();
  const changedFiles = normalizeChangedFiles(opts.changedFiles);
  const proofFieldBuild = [];
  let proofField = null;
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    proofField = await buildProofField(root, {
      intent,
      changedFiles: changedFiles.length ? changedFiles : undefined
    });
    proofFieldBuild.push(performance.now() - t0);
  }
  const proofValidation = validateProofFieldReport(proofField);
  const verification = proofField?.fast_lane_decision?.verification || [];
  const negativeWork = proofField?.negative_work_cache || [];
  const estimatedSavedWork = negativeWork.filter((item) => item.disposition === 'skip_with_evidence').length;
  const proofFieldMsP95 = Math.round(percentile(proofFieldBuild, 95));
  const workflowScanMsP95 = proofFieldMsP95;
  return {
    schema_version: 1,
    measured_at: nowIso(),
    theory: 'Potential Proof Field',
    iterations,
    intent: intent || null,
    budgets: DEFAULT_PERF_BUDGETS,
    metrics: {
      proof_field_build_ms_p95: proofFieldMsP95,
      workflow_scan_ms_p95: workflowScanMsP95,
      decision_mode: proofField?.fast_lane_decision?.mode || null,
      execution_lane: proofField?.execution_lane?.lane || null,
      fast_lane_eligible: Boolean(proofField?.fast_lane_decision?.eligible),
      fast_lane_allowed: Boolean(proofField?.execution_lane?.fast_lane_allowed),
      proof_cone_count: proofField?.proof_cones?.length || 0,
      verification_count: verification.length,
      negative_work_skipped_count: estimatedSavedWork,
      simplicity_score: Number(proofField?.simplicity_scorecard?.score || 0),
      outcome_criteria_passed: (proofField?.simplicity_scorecard?.criteria || []).filter((item) => item.passed).length,
      proof_field_valid: proofValidation.ok
    },
    proof_field: proofField,
    recommendation: workflowRecommendation(proofField, proofValidation),
    raw: {
      proof_field_build_ms: proofFieldBuild.map((value) => Math.round(value))
    }
  };
}

export function validateWorkflowPerfReport(report = {}) {
  const issues = [];
  if (report.schema_version !== 1) issues.push('schema_version');
  if (report.theory !== 'Potential Proof Field') issues.push('theory');
  if (!report.metrics || !Number.isFinite(Number(report.metrics.proof_field_build_ms_p95))) issues.push('proof_field_build_ms_p95');
  if (!report.metrics?.decision_mode) issues.push('decision_mode');
  if (!report.metrics?.execution_lane) issues.push('execution_lane');
  if (!Number.isFinite(Number(report.metrics?.simplicity_score))) issues.push('simplicity_score');
  if (!report.proof_field || !validateProofFieldReport(report.proof_field).ok) issues.push('proof_field');
  if (!report.recommendation?.mode) issues.push('recommendation');
  return { ok: issues.length === 0, issues };
}

function normalizeChangedFiles(files) {
  return [...new Set((files || []).flatMap((value) => String(value || '').split(',')).map((file) => file.trim()).filter(Boolean))]
    .sort();
}

function workflowRecommendation(proofField, validation) {
  if (!validation.ok) {
    return {
      mode: 'full_proof',
      reason: `proof field invalid: ${validation.issues.join(', ')}`,
      next: ['repair proof-field report generation', 'rerun sks perf workflow --json']
    };
  }
  const decision = proofField.fast_lane_decision;
  if (decision.eligible) {
    return {
      mode: 'fast_lane',
      reason: `selected proof cones are narrow, execution lane ${proofField.execution_lane?.lane || 'unknown'}, outcome score ${proofField.simplicity_scorecard?.score ?? 'n/a'}, and unrelated work is cached as negative work`,
      next: decision.verification
    };
  }
  return {
    mode: decision.mode,
    reason: decision.blockers.length ? `blocked by ${decision.blockers.join(', ')}` : 'balanced proof required',
    next: decision.verification
  };
}

async function packagePayloadSize(root) {
  let total = 0;
  for (const rel of ['bin', 'src']) total += await dirSize(path.join(root, rel));
  for (const rel of ['README.md', 'LICENSE', 'package.json']) total += await fileSize(path.join(root, rel));
  return total;
}

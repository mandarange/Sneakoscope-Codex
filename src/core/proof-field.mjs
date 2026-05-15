import path from 'node:path';
import { nowIso, readText, rel, runProcess, sha256, writeJsonAtomic } from './fsx.mjs';
import { buildDecisionLatticeReport, validateDecisionLatticeReport } from './decision-lattice.mjs';

export const PROOF_FIELD_SCHEMA_VERSION = 1;
export const FAST_LANE_MIN_SCORE = 0.75;

export const INVARIANT_LEDGER = Object.freeze([
  { id: 'db-catastrophic-guard', severity: 'critical', description: 'Database/table wipe, all-row DML, reset, and dangerous project/branch operations remain blocked.' },
  { id: 'honest-evidence', severity: 'critical', description: 'Final claims must be backed by current code, tests, artifacts, or explicitly marked unverified.' },
  { id: 'route-surface-consistency', severity: 'high', description: 'User-visible route surfaces must agree across CLI help, command catalog, generated skills, and docs.' },
  { id: 'triwiki-hydratable-context', severity: 'high', description: 'TriWiki context must remain coordinate+voxel backed and hydratable by source/hash/anchor.' },
  { id: 'no-unrequested-fallback-code', severity: 'high', description: 'Do not add substitute paths, mocks, shims, or fallback behavior unless explicitly requested.' }
]);

export const OUTCOME_RUBRIC = Object.freeze([
  { id: 'goal_fit', description: 'The selected work directly satisfies the user goal without drifting into adjacent pipeline work.', adversarial_lens: 'creative: challenge the literal framing and keep only the user goal that survives.' },
  { id: 'minimum_surface', description: 'Only touched surfaces inside the proof cone are included; unrelated routes, docs, DB, visual, or release work are skipped with evidence.', adversarial_lens: 'skeptic+architect: subtract unneeded surface and reject coupling that does not pay for itself now.' },
  { id: 'bounded_verification', description: 'Verification is enough to prove the selected cone and no broader than the risk requires.', adversarial_lens: 'researcher+validator: require current evidence and test the integration edge that can actually break.' },
  { id: 'escalation_defined', description: 'The path names the exact failure signals that should promote the work back to the full Team/Honest proof path.', adversarial_lens: 'validator+architect: name the failure signal before work starts and fail closed when it appears.' }
]);

export const SPEED_LANE_POLICY = Object.freeze({
  min_score: FAST_LANE_MIN_SCORE,
  fast_lane: 'proof_field_fast_lane',
  balanced_lane: 'proof_field_balanced_lane',
  full_lane: 'full_team_honest_path',
  skip_when_fast: ['parallel_analysis_scouting', 'planning_debate', 'fresh_executor_team', 'broad_route_rework'],
  always_keep: ['listed_verification', 'honest_mode', 'triwiki_validate_before_final'],
  fail_closed_on: ['database_surface', 'security_surface', 'visual_forensic_surface', 'unknown_surface', 'broad_change_set', 'verification_failed', 'unsupported_claim']
});

export const PROOF_CONE_DEFINITIONS = Object.freeze([
  {
    id: 'db_safety',
    surfaces: ['database', 'supabase', 'mad-sks'],
    match: [/db-safety|supabase|migration|rls|schema|sql/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock', 'sks db scan --json'],
    negative_work: ['browser_ui_e2e', 'visual_snapshot']
  },
  {
    id: 'route_surface',
    surfaces: ['routes', 'skills', 'cli-help', 'docs'],
    match: [/routes\.mjs|init\.mjs|codex-app|README|AGENTS|skills/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock', 'sks commands --json'],
    negative_work: ['database_migration', 'from_chat_img_forensics']
  },
  {
    id: 'cli_runtime',
    surfaces: ['cli', 'commands', 'runtime'],
    match: [/src\/cli|bin\/sks|maintenance-commands|fsx|codex-adapter/i],
    verification: ['npm run packcheck', 'node ./bin/sks.mjs commands --json', 'node ./bin/sks.mjs proof-field scan --json'],
    negative_work: ['browser_ui_e2e']
  },
  {
    id: 'context_memory',
    surfaces: ['triwiki', 'memory', 'evaluation'],
    match: [/triwiki|wiki|memory|evaluation|perf-bench|proof-field/i],
    verification: ['npm run packcheck', 'node ./bin/sks.mjs eval run --json', 'node ./bin/sks.mjs wiki validate .sneakoscope/wiki/context-pack.json'],
    negative_work: ['database_migration', 'browser_ui_e2e']
  },
  {
    id: 'release_surface',
    surfaces: ['package', 'changelog', 'release'],
    match: [/package\.json|package-lock\.json|CHANGELOG|README/i],
    verification: ['npm run release:check'],
    negative_work: []
  },
  {
    id: 'visual_forensic',
    surfaces: ['from-chat-img', 'visual', 'qa-loop'],
    match: [/from-chat-img|visual|screenshot|qa-loop|dogfood/i],
    verification: ['npm run packcheck', 'npm run selftest -- --mock'],
    negative_work: ['database_migration']
  }
]);

export async function buildProofField(root, opts = {}) {
  const changedFiles = normalizeChangedFiles(opts.changedFiles || await gitChangedFiles(root));
  const intent = String(opts.intent || '').trim();
  const selectedCones = selectProofCones(changedFiles, intent);
  const risk = riskSummary(changedFiles, selectedCones, intent);
  const negativeWork = buildNegativeWorkCache(selectedCones, risk);
  const fastLane = fastLaneDecision({ changedFiles, selectedCones, risk, negativeWork });
  const sourceHash = await sourceDigest(root, changedFiles);
  const contractClarity = contractClarityScore({ intent, changedFiles, selectedCones, risk });
  const workflowComplexity = workflowComplexityScore({ changedFiles, selectedCones, risk, verification: fastLane.verification });
  const teamTriggerMatrix = teamTriggerDecision({ intent, changedFiles, risk });
  const verificationStageCache = verificationStageCachePlan({ sourceHash, changedFiles, verification: fastLane.verification });
  const simplicity = outcomeScorecard({ intent, changedFiles, selectedCones, risk, negativeWork, fastLane, workflowComplexity });
  const executionLane = executionLaneDecision({ fastLane, simplicity, workflowComplexity, teamTriggerMatrix });
  const decisionLattice = normalizeDecisionLatticeReport(await buildDecisionLatticeReport({
    intent,
    changed_files: changedFiles,
    proof_cones: selectedCones,
    risk,
    contract_clarity: contractClarity,
    workflow_complexity: workflowComplexity,
    team_trigger_matrix: teamTriggerMatrix,
    verification_stage_cache: verificationStageCache,
    simplicity_scorecard: simplicity,
    fast_lane_decision: fastLane,
    execution_lane: executionLane,
    scoring_formula: 'simplicity_scorecard.score + contract_clarity.score - workflow_complexity.score - active_team_trigger_penalty'
  }));
  return {
    schema_version: PROOF_FIELD_SCHEMA_VERSION,
    generated_at: nowIso(),
    theory: 'Potential Proof Field',
    intent: intent || null,
    source_hash: sourceHash,
    changed_files: changedFiles,
    invariant_ledger: INVARIANT_LEDGER,
    outcome_rubric: OUTCOME_RUBRIC,
    speed_lane_policy: SPEED_LANE_POLICY,
    contract_clarity: contractClarity,
    workflow_complexity: workflowComplexity,
    team_trigger_matrix: teamTriggerMatrix,
    verification_stage_cache: verificationStageCache,
    decision_lattice: decisionLattice,
    simplicity_scorecard: simplicity,
    execution_lane: executionLane,
    proof_cones: selectedCones,
    negative_work_cache: negativeWork,
    fast_lane_decision: fastLane,
    next_action: nextAction(fastLane, simplicity)
  };
}

export async function writeProofFieldReport(root, opts = {}) {
  const report = await buildProofField(root, opts);
  const file = path.join(root, '.sneakoscope', 'reports', `proof-field-${Date.now()}.json`);
  await writeJsonAtomic(file, report);
  return { ...report, report_path: file };
}

export function validateProofFieldReport(report = {}) {
  const issues = [];
  if (report.schema_version !== PROOF_FIELD_SCHEMA_VERSION) issues.push('schema_version');
  if (!Array.isArray(report.invariant_ledger) || !report.invariant_ledger.length) issues.push('invariant_ledger');
  if (!Array.isArray(report.outcome_rubric) || report.outcome_rubric.length !== OUTCOME_RUBRIC.length) issues.push('outcome_rubric');
  if (!report.outcome_rubric?.every((item) => item.adversarial_lens)) issues.push('outcome_adversarial_lenses');
  if (!Number.isFinite(Number(report.simplicity_scorecard?.score))) issues.push('simplicity_scorecard');
  if (!Array.isArray(report.simplicity_scorecard?.criteria) || report.simplicity_scorecard.criteria.length !== OUTCOME_RUBRIC.length) issues.push('simplicity_criteria');
  if (!report.simplicity_scorecard?.criteria?.every((item) => item.adversarial_lens)) issues.push('simplicity_adversarial_lenses');
  if (!report.speed_lane_policy || Number(report.speed_lane_policy.min_score) !== FAST_LANE_MIN_SCORE) issues.push('speed_lane_policy');
  if (!Number.isFinite(Number(report.contract_clarity?.score))) issues.push('contract_clarity');
  if (!Array.isArray(report.contract_clarity?.components) || report.contract_clarity.components.length < 1) issues.push('contract_clarity_components');
  if (!Number.isFinite(Number(report.workflow_complexity?.score))) issues.push('workflow_complexity');
  if (!Array.isArray(report.team_trigger_matrix?.triggers)) issues.push('team_trigger_matrix');
  if (report.verification_stage_cache?.report_only !== true || !report.verification_stage_cache?.cache_key) issues.push('verification_stage_cache');
  const latticeValidation = validateDecisionLatticeReport(report.decision_lattice);
  if (!latticeValidation.ok) issues.push(`decision_lattice:${latticeValidation.issues.join('|')}`);
  if (!report.execution_lane?.lane) issues.push('execution_lane');
  if (report.execution_lane?.lane === SPEED_LANE_POLICY.fast_lane && report.execution_lane?.score < FAST_LANE_MIN_SCORE) issues.push('execution_lane_score');
  if (!Array.isArray(report.proof_cones)) issues.push('proof_cones');
  if (!Array.isArray(report.negative_work_cache)) issues.push('negative_work_cache');
  if (!report.fast_lane_decision?.mode) issues.push('fast_lane_decision');
  if (report.fast_lane_decision?.mode === 'fast_lane' && report.fast_lane_decision?.escalate_on?.length < 1) issues.push('fast_lane_escalation');
  return { ok: issues.length === 0, issues };
}

export async function proofFieldFixture() {
  const report = await buildProofField(process.cwd(), {
    intent: 'small CLI help surface update',
    changedFiles: ['src/cli/maintenance-commands.mjs', 'src/core/routes.mjs']
  });
  return {
    report,
    validation: validateProofFieldReport(report),
    checks: {
      route_cone_selected: report.proof_cones.some((cone) => cone.id === 'route_surface'),
      cli_cone_selected: report.proof_cones.some((cone) => cone.id === 'cli_runtime'),
      catastrophic_guard_present: report.invariant_ledger.some((item) => item.id === 'db-catastrophic-guard'),
      negative_release_work_recorded: report.negative_work_cache.some((item) => item.id === 'full_release_gate' && item.disposition === 'skip_with_evidence'),
      outcome_rubric_present: report.outcome_rubric.length === OUTCOME_RUBRIC.length,
      adversarial_lenses_present: report.outcome_rubric.every((item) => item.adversarial_lens) && report.simplicity_scorecard.criteria.every((item) => item.adversarial_lens),
      route_economy_present: report.contract_clarity?.report_only === true && report.workflow_complexity?.report_only === true && report.team_trigger_matrix?.report_only === true && report.verification_stage_cache?.report_only === true,
      decision_lattice_present: validateDecisionLatticeReport(report.decision_lattice).ok,
      decision_lattice_report_only: report.decision_lattice?.report_only === true,
      decision_lattice_selected_path: Boolean(report.decision_lattice?.selected_path?.id),
      decision_lattice_frontier_present: Array.isArray(report.decision_lattice?.frontier?.expanded_order) && report.decision_lattice.frontier.expanded_order.length > 0,
      decision_lattice_rejections_present: Array.isArray(report.decision_lattice?.rejected_alternatives),
      decision_lattice_scoring_formula_present: Boolean(report.decision_lattice?.scoring_formula),
      simplicity_score_usable: Number(report.simplicity_scorecard?.score) >= FAST_LANE_MIN_SCORE,
      execution_fast_lane_selected: report.execution_lane?.lane === SPEED_LANE_POLICY.fast_lane
    }
  };
}

function normalizeDecisionLatticeReport(report = {}) {
  return {
    ...report,
    scoring_formula: report.scoring_formula || report.research_basis?.scoring_formula || null
  };
}

async function gitChangedFiles(root) {
  const result = await runProcess('git', ['diff', '--name-only', 'HEAD', '--'], { cwd: root, timeoutMs: 10000, maxOutputBytes: 128 * 1024 });
  if (result.code !== 0) return [];
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function normalizeChangedFiles(files = []) {
  return [...new Set((files || []).flatMap((value) => String(value || '').split(',')).map((file) => file.trim()).filter(Boolean))]
    .sort();
}

function selectProofCones(files, intent) {
  const haystack = `${files.join('\n')}\n${intent || ''}`;
  const selected = PROOF_CONE_DEFINITIONS
    .filter((cone) => cone.match.some((re) => re.test(haystack)))
    .map((cone) => ({
      id: cone.id,
      surfaces: cone.surfaces,
      verification: cone.verification,
      matched_files: files.filter((file) => cone.match.some((re) => re.test(file)))
    }));
  if (!selected.length) {
    selected.push({
      id: 'generic_local_change',
      surfaces: ['unknown'],
      verification: ['npm run packcheck', 'focused relevant tests or documented justification'],
      matched_files: files
    });
  }
  return selected;
}

function riskSummary(files, cones, intent) {
  const text = `${files.join('\n')}\n${intent || ''}`;
  const flags = {
    database: /\b(db|database|supabase|sql|migration|rls|schema)\b/i.test(text),
    security: /\b(auth|permission|token|secret|security|권한|보안)\b/i.test(text),
    visual_forensic: /from-chat-img|screenshot|visual|이미지|스크린샷/i.test(text),
    release: /package\.json|package-lock\.json|CHANGELOG|release|publish/i.test(text),
    broad_change: files.length > 3,
    unknown_surface: cones.some((cone) => cone.id === 'generic_local_change')
  };
  const score = Object.values(flags).filter(Boolean).length;
  const level = score >= 3 ? 'high' : score === 2 ? 'medium' : score === 1 ? 'low' : 'minimal';
  return { level, score, flags };
}

function buildNegativeWorkCache(cones, risk) {
  const required = new Set(cones.flatMap((cone) => cone.verification));
  const candidates = new Set(cones.flatMap((cone) => cone.negative_work || []));
  const out = [];
  for (const id of candidates) {
    const blockedByRisk = (id === 'database_migration' && risk.flags.database)
      || (id === 'browser_ui_e2e' && risk.flags.visual_forensic);
    out.push({
      id,
      disposition: blockedByRisk ? 'not_skipped_risk_present' : 'skip_with_evidence',
      reason: blockedByRisk ? 'risk flag requires explicit verification' : 'selected proof cones do not touch this surface'
    });
  }
  if (!required.has('npm run release:check') && !risk.flags.release) {
    out.push({ id: 'full_release_gate', disposition: 'skip_with_evidence', reason: 'no package/release surface in selected cones' });
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

function fastLaneDecision({ changedFiles, selectedCones, risk, negativeWork }) {
  const verification = [...new Set(selectedCones.flatMap((cone) => cone.verification))];
  const safeSkips = negativeWork.filter((item) => item.disposition === 'skip_with_evidence').map((item) => item.id);
  const blockers = [];
  if (!changedFiles.length) blockers.push('no_changed_files');
  if (changedFiles.length > 3) blockers.push('broad_change_set');
  if (risk.flags.database) blockers.push('database_surface');
  if (risk.flags.security) blockers.push('security_surface');
  if (risk.flags.visual_forensic) blockers.push('visual_forensic_surface');
  if (risk.flags.unknown_surface) blockers.push('unknown_surface');
  const mode = blockers.length ? (risk.level === 'high' ? 'full_proof' : 'balanced') : 'fast_lane';
  return {
    mode,
    eligible: mode === 'fast_lane',
    blockers,
    verification,
    negative_work: safeSkips,
    escalate_on: ['verification_failed', 'proof_cone_unknown', 'source_hash_changed', 'unsupported_claim', 'user_scope_expanded']
  };
}

function contractClarityScore({ intent, changedFiles, selectedCones, risk }) {
  const components = [
    {
      id: 'goal_fit',
      floor: 0.7,
      score: intent ? 1 : 0.25,
      evidence: intent ? 'intent provided' : 'missing explicit intent'
    },
    {
      id: 'safety_scope_clarity',
      floor: 0.7,
      score: risk.flags.unknown_surface ? 0.4 : 1,
      evidence: risk.flags.unknown_surface ? 'unknown surface present' : `risk flags classified: ${Object.entries(risk.flags).filter(([, value]) => value).map(([key]) => key).join(', ') || 'none'}`
    },
    {
      id: 'acceptance_observability',
      floor: 0.6,
      score: /accept|verify|test|done|complete|검증|완료|구현|개선/i.test(intent || '') ? 1 : 0.65,
      evidence: /accept|verify|test|done|complete|검증|완료|구현|개선/i.test(intent || '') ? 'observable outcome language present' : 'acceptance inferred from proof cones'
    },
    {
      id: 'write_scope_certainty',
      floor: 0.7,
      score: changedFiles.length > 0 && changedFiles.length <= 3 ? 1 : (changedFiles.length > 0 ? 0.55 : 0.2),
      evidence: `${changedFiles.length} changed file(s) in proposed scope`
    },
    {
      id: 'context_confidence',
      floor: 0.7,
      score: selectedCones.length > 0 && !risk.flags.unknown_surface ? 1 : 0.45,
      evidence: `${selectedCones.length} proof cone(s), unknown_surface=${risk.flags.unknown_surface}`
    }
  ];
  const score = Number((components.reduce((sum, item) => sum + item.score, 0) / components.length).toFixed(2));
  const failed = components.filter((item) => item.score < item.floor).map((item) => item.id);
  return {
    schema_version: 1,
    report_only: true,
    score,
    passed: score >= 0.8 && failed.length === 0,
    ask_recommended: failed.length > 0,
    failed_floors: failed,
    components
  };
}

function workflowComplexityScore({ changedFiles, selectedCones, risk, verification }) {
  const surfaces = new Set(selectedCones.flatMap((cone) => cone.surfaces || []));
  const weighted = {
    changed_files: Math.min(changedFiles.length, 8) / 8 * 0.3,
    proof_cones: Math.min(selectedCones.length, 4) / 4 * 0.2,
    risk_flags: Math.min(risk.score, 4) / 4 * 0.25,
    verification: Math.min((verification || []).length, 6) / 6 * 0.15,
    surfaces: Math.min(surfaces.size, 6) / 6 * 0.1
  };
  const score = Number(Object.values(weighted).reduce((sum, value) => sum + value, 0).toFixed(2));
  const band = score >= 0.67 ? 'frontier' : (score >= 0.34 ? 'balanced' : 'focused');
  return {
    schema_version: 1,
    report_only: true,
    score,
    band,
    inputs: {
      changed_file_count: changedFiles.length,
      proof_cone_count: selectedCones.length,
      route_surface_count: surfaces.size,
      risk_flag_count: risk.score,
      verification_count: (verification || []).length
    },
    weighted
  };
}

function teamTriggerDecision({ intent, changedFiles, risk }) {
  const triggers = [
    { id: 'explicit_team', active: /\$?team\b/i.test(intent || ''), reason: 'user explicitly selected Team' },
    { id: 'broad_change_set', active: changedFiles.length > 3, reason: `${changedFiles.length} changed file(s)` },
    { id: 'database_surface', active: risk.flags.database, reason: 'database risk flag present' },
    { id: 'security_surface', active: risk.flags.security, reason: 'security risk flag present' },
    { id: 'visual_forensic_surface', active: risk.flags.visual_forensic, reason: 'visual forensic risk flag present' },
    { id: 'unknown_surface', active: risk.flags.unknown_surface, reason: 'unknown proof cone selected' },
    { id: 'unsupported_claim', active: false, reason: 'only activated by Honest/H-Proof evidence' },
    { id: 'verification_failed', active: false, reason: 'only activated after verification failure' }
  ];
  const active = triggers.filter((trigger) => trigger.active).map((trigger) => trigger.id);
  return {
    schema_version: 1,
    report_only: true,
    full_team_recommended: active.length > 0,
    active_triggers: active,
    triggers
  };
}

function verificationStageCachePlan({ sourceHash, changedFiles, verification }) {
  const stage1 = [...new Set(verification || [])].filter((command) => /packcheck|selftest|commands --json|wiki validate|eval run/i.test(command));
  const cacheInput = { source_hash: sourceHash || null, changed_files: changedFiles, stage1 };
  return {
    schema_version: 1,
    report_only: true,
    status: sourceHash ? 'planned' : 'source_hash_missing',
    cache_key: sha256(JSON.stringify(cacheInput)).slice(0, 16),
    source_hash: sourceHash || null,
    stage1_commands: stage1,
    invalidates_on: ['source_hash_changed', 'command_changed', 'cwd_changed', 'env_changed'],
    reuse_policy: 'fail_closed'
  };
}

function outcomeScorecard({ intent, changedFiles, selectedCones, risk, negativeWork, fastLane, workflowComplexity }) {
  const skipped = negativeWork.filter((item) => item.disposition === 'skip_with_evidence').length;
  const criteria = [
    { id: 'goal_fit', passed: Boolean(intent || changedFiles.length), evidence: intent ? 'intent provided' : 'changed files define scope' },
    { id: 'minimum_surface', passed: changedFiles.length <= 3 && !risk.flags.unknown_surface, evidence: `${changedFiles.length} changed file(s), ${selectedCones.length} proof cone(s), complexity=${workflowComplexity?.band || 'unknown'}` },
    { id: 'bounded_verification', passed: fastLane.verification.length > 0 && fastLane.verification.length <= 4, evidence: `${fastLane.verification.length} focused verification command(s)` },
    { id: 'escalation_defined', passed: Array.isArray(fastLane.escalate_on) && fastLane.escalate_on.length > 0, evidence: `${fastLane.escalate_on.length} escalation trigger(s)` }
  ].map((criterion) => ({
    ...criterion,
    adversarial_lens: OUTCOME_RUBRIC.find((item) => item.id === criterion.id)?.adversarial_lens || null
  }));
  const passed = criteria.filter((item) => item.passed).length;
  return {
    schema_version: 1,
    score: Number((passed / OUTCOME_RUBRIC.length).toFixed(2)),
    criteria,
    unrelated_work_skipped: skipped,
    decision_mode: fastLane.mode
  };
}

function executionLaneDecision({ fastLane, simplicity, workflowComplexity, teamTriggerMatrix }) {
  const score = Number(simplicity?.score || 0);
  const fast = Boolean(fastLane?.eligible) && score >= FAST_LANE_MIN_SCORE;
  const lane = fast
    ? SPEED_LANE_POLICY.fast_lane
    : (fastLane?.mode === 'full_proof' ? SPEED_LANE_POLICY.full_lane : SPEED_LANE_POLICY.balanced_lane);
  return {
    schema_version: 1,
    lane,
    score,
    fast_lane_allowed: fast,
    skip_when_fast: fast ? SPEED_LANE_POLICY.skip_when_fast : [],
    keep: SPEED_LANE_POLICY.always_keep,
    verification: fastLane?.verification || [],
    blockers: fastLane?.blockers || [],
    escalate_on: [...new Set([...(fastLane?.escalate_on || []), ...SPEED_LANE_POLICY.fail_closed_on])],
    reason: fast
      ? `Proof Field score ${score} >= ${FAST_LANE_MIN_SCORE} with no fast-lane blockers`
      : `Fast lane not allowed: mode=${fastLane?.mode || 'unknown'}, score=${score}, complexity=${workflowComplexity?.band || 'unknown'}, team_triggers=${(teamTriggerMatrix?.active_triggers || []).join(', ') || 'none'}, blockers=${(fastLane?.blockers || []).join(', ') || 'none'}`
  };
}

function nextAction(decision, simplicity) {
  const score = Number.isFinite(Number(simplicity?.score)) ? ` outcome_score=${simplicity.score}` : '';
  if (decision.mode === 'fast_lane') return `apply minimal patch, run listed verification, then Honest Mode against the proof field report;${score}`;
  if (decision.mode === 'balanced') return `narrow the change set or run parent-led implementation with listed verification and reviewer escalation if checks fail;${score}`;
  return 'use full Team/Honest proof path; fast lane is intentionally blocked for this risk state';
}

async function sourceDigest(root, files) {
  const rows = [];
  for (const file of files) {
    const abs = path.resolve(root, file);
    if (!abs.startsWith(path.resolve(root))) continue;
    const text = await readText(abs, null);
    rows.push([rel(root, abs), text == null ? null : sha256(text).slice(0, 16)]);
  }
  return sha256(JSON.stringify(rows)).slice(0, 24);
}

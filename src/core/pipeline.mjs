import fsp from 'node:fs/promises';
import path from 'node:path';
import { appendJsonl, exists, nowIso, readJson, readText, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { containsUserQuestion, noQuestionContinuationReason } from './no-question-guard.mjs';
import { createMission, missionDir, setCurrent } from './mission.mjs';
import { buildQuestionSchemaForRoute, writeQuestions } from './questions.mjs';
import { sealContract } from './decision-contract.mjs';
import { scanDbSafety } from './db-safety.mjs';
import { GOAL_WORKFLOW_ARTIFACT, writeGoalWorkflow } from './goal-workflow.mjs';
import { writeCodeStructureReport } from './code-structure.mjs';
import { writeMemorySweepReport } from './memory-governor.mjs';
import { writeMistakeMemoryReport } from './mistake-memory.mjs';
import { MISTAKE_RECALL_ARTIFACT, mistakeRecallGateStatus } from './mistake-recall.mjs';
import { recordSkillDreamEvent, skillDreamPolicyText, writeSkillForgeReport } from './skill-forge.mjs';
import { evaluateResearchGate, writeResearchPlan } from './research.mjs';
import { PPT_REQUIRED_GATE_FIELDS, writePptRouteArtifacts } from './ppt.mjs';
import { writeQaLoopArtifacts } from './qa-loop.mjs';
import { IMAGE_UX_REVIEW_GATE_ARTIFACT, IMAGE_UX_REVIEW_POLICY_ARTIFACT, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT, IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS, writeImageUxReviewRouteArtifacts } from './image-ux-review.mjs';
import { responseLanguageInstruction } from './language-preference.mjs';
import { SPEED_LANE_POLICY } from './proof-field.mjs';
import { validateRouteCompletionProof } from './proof/route-proof-gate.mjs';
import { routeFromState, routeRequiresCompletionProof } from './proof/route-proof-policy.mjs';
import { permissionGateSummary } from './permission-gates.mjs';
import { CODEX_APP_IMAGE_GENERATION_DOC_URL, CODEX_COMPUTER_USE_EVIDENCE_SOURCE, CODEX_COMPUTER_USE_ONLY_POLICY, CODEX_IMAGEGEN_REQUIRED_POLICY, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, SOLUTION_SCOUT_STAGE_ID, chatCaptureIntakeText, context7RequirementText, dollarCommand, evidenceMentionsForbiddenBrowserAutomation, getdesignReferencePolicyText, hasFromChatImgSignal, hasMadSksSignal, imageUxReviewPipelinePolicyText, looksLikeProblemSolvingRequest, noUnrequestedFallbackCodePolicyText, outcomeRubricPolicyText, pptPipelineAllowlistPolicyText, reflectionRequiredForRoute, reasoningInstruction, routeNeedsContext7, routePrompt, routeReasoning, routeRequiresSubagents, solutionScoutPolicyText, speedLanePolicyText, stripDollarCommand, stripMadSksSignal, stripVisibleDecisionAnswerBlocks, subagentExecutionPolicyText, stackCurrentDocsPolicyText, triwikiContextTracking, triwikiContextTrackingText, triwikiStagePolicyText } from './routes.mjs';
import { TEAM_DECOMPOSITION_ARTIFACT, TEAM_GRAPH_ARTIFACT, TEAM_INBOX_DIR, TEAM_RUNTIME_TASKS_ARTIFACT, teamRuntimePlanMetadata, teamRuntimeRequiredArtifacts, validateTeamRuntimeArtifacts, writeTeamRuntimeArtifacts } from './team-dag.mjs';
import { formatAgentReasoning, formatRoleCounts, initTeamLive, parseTeamSpecText, teamReasoningPolicy } from './team-live.mjs';
import { evaluateTeamReviewPolicyGate, MIN_TEAM_REVIEWER_LANES, MIN_TEAM_REVIEW_POLICY_TEXT, teamReviewPolicy } from './team-review-policy.mjs';

export { routePrompt };

export const PIPELINE_PLAN_ARTIFACT = 'pipeline-plan.json';
export const PIPELINE_PLAN_SCHEMA_VERSION = 1;

function ambientGoalContinuation() {
  return {
    schema_version: 1,
    enabled: true,
    mode: 'ambient_codex_native_goal_overlay',
    native_slash_command: '/goal',
    non_disruptive: true,
    rule: 'Use Codex native goal persistence when available to keep work resumable until completion; it never replaces the selected SKS route, Team, TriWiki, verification, reflection, or Honest Mode gates.'
  };
}
const REFLECTION_ARTIFACT = 'reflection.md';
const REFLECTION_GATE = 'reflection-gate.json';
const REFLECTION_MEMORY_PATH = '.sneakoscope/memory/q2_facts/post-route-reflection.md';
const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';
const COMPLIANCE_LOOP_GUARD_ARTIFACT = 'compliance-loop-guard.json';
const HARD_BLOCKER_ARTIFACT = 'hard-blocker.json';
const DEFAULT_COMPLIANCE_LOOP_LIMIT = 3;
const CLARIFICATION_BYPASS_ROUTES = new Set(['Answer', 'DFix', 'Help', 'Wiki', 'ComputerUse', 'Goal']);
const QUESTION_GATE_ROUTES = new Set(['QALoop', 'PPT']);
const LIGHTWEIGHT_ROUTES = new Set(['Answer', 'DFix', 'Help', 'Wiki']);
const FULL_ROUTE_STAGES = Object.freeze([
  'route_classification',
  SOLUTION_SCOUT_STAGE_ID,
  'skill_dream_counter',
  'ambiguity_gate',
  'pipeline_plan',
  'proof_field_scan',
  'triwiki_use_first',
  'context7_evidence',
  'parallel_analysis_scouting',
  'planning_debate',
  'route_materialization',
  'fresh_executor_team',
  'broad_route_rework',
  'focused_implementation',
  'listed_verification',
  'triwiki_validate_before_final',
  'reflection',
  'honest_mode'
]);

function reflectionInstructionText(commandPrefix = 'sks') {
  return `Post-route reflection: full routes load \`reflection\` after work/tests and before final; DFix/Answer/Help/Wiki/SKS discovery are exempt. Write ${REFLECTION_ARTIFACT}; record only real misses/gaps, or no_issue_acknowledged. For lessons, append TriWiki claim rows to ${REFLECTION_MEMORY_PATH}. Run "${commandPrefix} wiki refresh" or pack, validate, then pass ${REFLECTION_GATE}.`;
}

export function buildPipelinePlan(input = {}) {
  const route = input.route || routePrompt(input.task || '$SKS');
  const task = String(input.task || '').trim();
  const ambiguity = normalizeAmbiguity(input.ambiguity, route);
  const proof = normalizeProofField(input.proofField);
  const lane = selectPipelineLane(route, task, proof);
  const stages = buildPipelineStages(route, task, ambiguity, lane, Boolean(input.required));
  const verification = planVerification(route, proof);
  const skipped = stages.filter((stage) => stage.status === 'skipped').map((stage) => stage.id);
  const kept = stages.filter((stage) => stage.status !== 'skipped' && stage.status !== 'not_applicable').map((stage) => stage.id);
  const routeEconomy = routeEconomyPlan(proof);
  return {
    schema_version: PIPELINE_PLAN_SCHEMA_VERSION,
    generated_at: nowIso(),
    mission_id: input.missionId || null,
    route: {
      id: route?.id || 'SKS',
      command: route?.command || '$SKS',
      mode: route?.mode || 'SKS',
      stop_gate: route?.stopGate || 'honest_mode',
      required_skills: route?.requiredSkills || [],
      context7_required: Boolean(input.required),
      subagents_required: routeRequiresSubagents(route, task),
      reflection_required: reflectionRequiredForRoute(route)
    },
    task,
    ambiguity_gate: ambiguity,
    runtime_lane: lane,
    stages,
    stage_summary: {
      total: stages.length,
      kept: kept.length,
      skipped: skipped.length,
      not_applicable: stages.filter((stage) => stage.status === 'not_applicable').length
    },
    skipped_stages: skipped,
    kept_stages: kept,
    verification,
    invariants: ['no_unrequested_fallback_code', 'listed_verification', 'triwiki_validate_before_final', 'honest_mode'],
    proof_field: proof,
    route_economy: routeEconomy,
    skill_dream: input.skillDream || { attached: false, reason: 'skill dreaming uses cheap counters and only runs inventory at threshold' },
    goal_continuation: ambientGoalContinuation(),
    next_actions: planNextActions(route, task, ambiguity, lane),
    no_unrequested_fallback_code: true
  };
}

export async function writePipelinePlan(dir, input = {}) {
  const plan = buildPipelinePlan(input);
  await writeJsonAtomic(path.join(dir, PIPELINE_PLAN_ARTIFACT), plan);
  return plan;
}

export function validatePipelinePlan(plan = {}) {
  const issues = [];
  if (plan.schema_version !== PIPELINE_PLAN_SCHEMA_VERSION) issues.push('schema_version');
  if (!plan.route?.id || !plan.route?.command) issues.push('route');
  if (!plan.runtime_lane?.lane) issues.push('runtime_lane');
  if (!Array.isArray(plan.stages) || !plan.stages.length) issues.push('stages');
  if (!Array.isArray(plan.verification) || !plan.verification.length) issues.push('verification');
  if (!plan.route_economy?.mode) issues.push('route_economy');
  const routeEconomyLatticeIssues = validateRouteEconomyDecisionLattice(plan.route_economy, plan.proof_field);
  if (routeEconomyLatticeIssues.length) issues.push(...routeEconomyLatticeIssues.map((issue) => `route_economy.decision_lattice:${issue}`));
  if (plan.no_unrequested_fallback_code !== true || !plan.invariants?.includes('no_unrequested_fallback_code')) issues.push('fallback_guard');
  if (!plan.next_actions?.length) issues.push('next_actions');
  return { ok: issues.length === 0, issues };
}

function validateRouteEconomyDecisionLattice(routeEconomy = {}, proof = {}) {
  const lattice = routeEconomy.decision_lattice;
  if (!lattice) return [];
  const issues = [];
  if (routeEconomy.report_only !== true || routeEconomy.mode !== 'report_only') issues.push('requires_report_only_route_economy');
  if (lattice.report_only !== true) issues.push('report_only');
  if (!lattice.selected_path) issues.push('selected_path');
  if (!Number.isFinite(Number(lattice.selected_f_score))) issues.push('selected_f_score');
  if (!Number.isFinite(Number(lattice.frontier_count)) || Number(lattice.frontier_count) < 1) issues.push('frontier_count');
  if (!Number.isFinite(Number(lattice.rejected_alternatives_count))) issues.push('rejected_alternatives_count');
  if (proof?.attached && proof.decision_lattice) {
    const source = proof.decision_lattice;
    if (lattice.selected_path !== source.selected_path?.id) issues.push('selected_path_mismatch');
    if (Number(lattice.frontier_count) !== Number(source.frontier?.expanded_order?.length || 0)) issues.push('frontier_count_mismatch');
    if (Number(lattice.rejected_alternatives_count) !== Number(source.rejected_alternatives?.length || 0)) issues.push('rejected_alternatives_count_mismatch');
  }
  return issues;
}

function normalizeAmbiguity(value = {}, route) {
  const required = value.required ?? !CLARIFICATION_BYPASS_ROUTES.has(route?.id);
  const slots = Number(value.slots || 0);
  let status = value.status || (required ? 'required' : 'not_required');
  if (required && value.auto_sealed) status = 'auto_sealed';
  else if (required && slots > 0) status = 'awaiting_answers';
  else if (required && value.passed) status = 'contract_sealed';
  return {
    required: Boolean(required),
    status,
    slots,
    auto_sealed: Boolean(value.auto_sealed),
    passed: Boolean(value.passed || value.auto_sealed || status === 'contract_sealed'),
    contract_hash: value.contract_hash || null
  };
}

function normalizeProofField(report) {
  if (!report) return { attached: false, reason: 'not built during route intake; attach with sks pipeline plan --proof-field after concrete scope/changed files are known' };
  return {
    attached: true,
    lane: report.execution_lane?.lane || null,
    fast_lane_allowed: Boolean(report.execution_lane?.fast_lane_allowed),
    score: Number(report.execution_lane?.score || report.simplicity_scorecard?.score || 0),
    blockers: report.execution_lane?.blockers || report.fast_lane_decision?.blockers || [],
    skip_when_fast: report.execution_lane?.skip_when_fast || [],
    keep: report.execution_lane?.keep || SPEED_LANE_POLICY.always_keep,
    verification: report.execution_lane?.verification || report.fast_lane_decision?.verification || [],
    proof_cones: (report.proof_cones || []).map((cone) => cone.id),
    source_hash: report.source_hash || null,
    contract_clarity: report.contract_clarity || null,
    workflow_complexity: report.workflow_complexity || null,
    team_trigger_matrix: report.team_trigger_matrix || null,
    verification_stage_cache: report.verification_stage_cache || null,
    decision_lattice: report.decision_lattice || null
  };
}

function routeEconomyPlan(proof = {}) {
  if (!proof.attached) {
    return {
      schema_version: 1,
      mode: 'unavailable',
      report_only: true,
      reason: proof.reason || 'Proof Field not attached yet'
    };
  }
  const triggers = proof.team_trigger_matrix?.active_triggers || [];
  return {
    schema_version: 1,
    mode: 'report_only',
    report_only: true,
    contract_clarity_score: Number(proof.contract_clarity?.score || 0),
    contract_clarity_passed: proof.contract_clarity?.passed === true,
    ask_recommended: proof.contract_clarity?.ask_recommended === true,
    workflow_complexity_score: Number(proof.workflow_complexity?.score || 0),
    workflow_complexity_band: proof.workflow_complexity?.band || null,
    team_trigger_count: triggers.length,
    active_team_triggers: triggers,
    verification_stage_cache_key: proof.verification_stage_cache?.cache_key || null,
    decision_lattice: proof.decision_lattice ? {
      selected_path: proof.decision_lattice.selected_path?.id || null,
      selected_f_score: proof.decision_lattice.selected_path?.cost?.f ?? null,
      frontier_count: proof.decision_lattice.frontier?.expanded_order?.length || 0,
      rejected_alternatives_count: proof.decision_lattice.rejected_alternatives?.length || 0,
      report_only: proof.decision_lattice.report_only === true
    } : null,
    deletion_policy: 'do_not_delete_or_skip_pipeline_stages_until_report_only_metrics_are_calibrated'
  };
}

function selectPipelineLane(route, task, proof) {
  if (proof.attached && proof.lane) {
    return {
      lane: proof.lane,
      source: 'proof_field',
      fast_lane_allowed: Boolean(proof.fast_lane_allowed),
      reason: proof.fast_lane_allowed ? 'Proof Field allowed the fast lane.' : `Proof Field selected ${proof.lane}.`,
      blockers: proof.blockers || [],
      skip_when_fast: proof.fast_lane_allowed ? SPEED_LANE_POLICY.skip_when_fast : [],
      keep: proof.keep || SPEED_LANE_POLICY.always_keep
    };
  }
  if (route?.id === 'ComputerUse') return { lane: 'computer_use_fast_lane', source: 'route_policy', fast_lane_allowed: true, reason: 'Computer Use route is intentionally direct and defers wiki/honest checks to closeout.', blockers: [], skip_when_fast: ['parallel_analysis_scouting', 'planning_debate', 'fresh_executor_team'], keep: ['focused_implementation', 'triwiki_validate_before_final', 'honest_mode'] };
  if (LIGHTWEIGHT_ROUTES.has(route?.id)) return { lane: `${String(route.id).toLowerCase()}_lightweight_lane`, source: 'route_policy', fast_lane_allowed: true, reason: 'Lightweight route bypasses full mission orchestration by design.', blockers: [], skip_when_fast: SPEED_LANE_POLICY.skip_when_fast, keep: ['focused_implementation', 'listed_verification', 'honest_mode'] };
  if (routeRequiresSubagents(route, task)) return { lane: SPEED_LANE_POLICY.full_lane, source: 'route_policy', fast_lane_allowed: false, reason: 'No Proof Field attached and this route normally requires full Team evidence.', blockers: ['proof_field_not_attached'], skip_when_fast: [], keep: SPEED_LANE_POLICY.always_keep };
  return { lane: SPEED_LANE_POLICY.balanced_lane, source: 'route_policy', fast_lane_allowed: false, reason: 'Balanced parent-owned route until Proof Field proves a narrower lane.', blockers: ['proof_field_not_attached'], skip_when_fast: [], keep: SPEED_LANE_POLICY.always_keep };
}

function buildPipelineStages(route, task, ambiguity, lane, context7Required) {
  return FULL_ROUTE_STAGES.map((id) => {
    const optional = optionalStage(route, task, ambiguity, context7Required, id);
    const skippedByFast = lane.fast_lane_allowed && SPEED_LANE_POLICY.skip_when_fast.includes(id);
    const skipped = skippedByFast || optional.skip;
    return {
      id,
      status: skipped ? (optional.notApplicable ? 'not_applicable' : 'skipped') : (id === 'ambiguity_gate' && ambiguity.passed ? 'passed' : 'keep'),
      reason: skippedByFast ? 'proof_field_fast_lane' : optional.reason
    };
  });
}

function optionalStage(route, task, ambiguity, context7Required, id) {
  if (id === SOLUTION_SCOUT_STAGE_ID && !looksLikeProblemSolvingRequest(task)) return { skip: true, notApplicable: true, reason: 'no_problem_solving_signal' };
  if (id === SOLUTION_SCOUT_STAGE_ID && ['Answer', 'Help', 'Wiki'].includes(route?.id)) return { skip: true, notApplicable: true, reason: 'route_not_code_repair' };
  if (id === SOLUTION_SCOUT_STAGE_ID) return { skip: false, reason: 'problem_solving_request_requires_web_similarity_scout' };
  if (id === 'ambiguity_gate' && ambiguity?.required === false) return { skip: true, notApplicable: true, reason: 'ambiguity_gate_not_required_for_entrypoint' };
  if (id === 'ambiguity_gate' && CLARIFICATION_BYPASS_ROUTES.has(route?.id)) return { skip: true, notApplicable: true, reason: 'route_bypasses_clarification' };
  if (id === 'context7_evidence' && !context7Required) return { skip: true, notApplicable: true, reason: 'context7_not_required_by_route' };
  if (id === 'reflection' && !reflectionRequiredForRoute(route)) return { skip: true, notApplicable: true, reason: 'reflection_not_required_for_route' };
  if (['parallel_analysis_scouting', 'planning_debate', 'fresh_executor_team'].includes(id) && !routeRequiresSubagents(route, task)) return { skip: true, notApplicable: true, reason: 'subagent_team_not_required_by_route' };
  return { skip: false, reason: 'required_by_lane' };
}

function planVerification(route, proof) {
  const out = new Set(proof.verification || []);
  if (route?.id === 'Team') out.add('sks validate-artifacts latest --json');
  if (reflectionRequiredForRoute(route)) out.add('sks wiki validate .sneakoscope/wiki/context-pack.json');
  out.add('npm run packcheck');
  out.add('npm run selftest -- --mock');
  return [...out];
}

function planNextActions(route, task, ambiguity, lane) {
  if (ambiguity.required && !ambiguity.passed) {
    return [
      'auto-seal execution contract from inferred answers',
      ...(looksLikeProblemSolvingRequest(task) ? ['run Solution Scout web search for similar fixes before editing'] : []),
      'continue with decision-contract.json'
    ];
  }
  const actions = ['read pipeline-plan.json before work', 'execute kept stages only', 'run listed verification'];
  if (!lane.fast_lane_allowed && routeRequiresSubagents(route, task)) actions.splice(1, 0, 'materialize full Team artifacts before implementation');
  if (looksLikeProblemSolvingRequest(task)) actions.splice(1, 0, 'run Solution Scout web search for similar fixes before editing');
  actions.push('refresh/validate TriWiki when required', 'finish with completion summary and Honest Mode');
  return actions;
}

export function promptPipelineContext(prompt, route = null) {
  const cleanPrompt = stripVisibleDecisionAnswerBlocks(prompt);
  route = route || routePrompt(cleanPrompt);
  const required = routeNeedsContext7(route, cleanPrompt);
  const reasoning = routeReasoning(route, cleanPrompt);
  const directFix = route?.id === 'DFix';
  if (directFix) return dfixQuickContext(cleanPrompt, route);
  if (route?.id === 'Answer') return answerOnlyContext(cleanPrompt, route);
  if (route?.id === 'ComputerUse') return computerUseFastContext(cleanPrompt, route);
  const lines = [
    `SKS skill-first pipeline active. Route: ${route?.command || '$SKS'} (${route?.route || 'general SKS workflow'}).`,
    reasoningInstruction(reasoning),
    'Before work, load the required SKS skill context and follow the route lifecycle instead of treating the command as plain text.',
    'Codex App visibility: briefly surface what SKS is doing before tools run, mirror important worker/tool status to mission artifacts, and keep progress legible to the user.',
    responseLanguageInstruction(cleanPrompt),
    'Hook visibility limit: hooks can inject context/status or block/continue a turn, but they cannot create arbitrary live chat bubbles; use team events, mission files, or normal assistant updates for live transcript details.',
    'Ambient Goal continuation: even without an explicit $Goal keyword, use Codex native /goal persistence when it helps keep long work resumable and complete; do not let it replace or skip the selected SKS route gates.',
    'Route contract: execution routes infer contract answers from the prompt, TriWiki/current-code defaults, and conservative SKS policy. DFix and Answer bypass stateful execution because they do not start implementation.',
    'Plan-first interaction: when ambiguity questions are truly required, show the user only the missing human decision(s), then seal the decision contract internally and execute/verify.',
    'Question-shaped directive policy: before using Answer, decide whether a question is a real information request or an implicit instruction/complaint about broken behavior. Rhetorical bug reports, mandatory-policy statements, and "why is this not happening?" execution complaints must route to Team, not Answer.',
    'Best-practice prompt shape: extract Goal, Context, Constraints, and Done-when before implementation; keep questions compact and only ask for answers that can change scope, safety, user-facing behavior, or acceptance criteria.',
    chatCaptureIntakeText(),
    'Default execution routing: general implementation/code-changing prompts promote to Team so the normal path is parallel analysis, TriWiki refresh, debate/consensus, then fresh parallel executors. Answer, DFix, Help, Wiki maintenance, and safety-specific routes are intentional exceptions.',
    'Stance: infer the user intent aggressively from rough wording, local context, TriWiki, and conservative defaults; do not surface prequestion sheets before work.',
    subagentExecutionPolicyText(route, cleanPrompt),
    solutionScoutPolicyText(cleanPrompt),
    noUnrequestedFallbackCodePolicyText(),
    outcomeRubricPolicyText(),
    speedLanePolicyText(),
    skillDreamPolicyText(),
    route?.id === 'PPT'
      ? `${pptPipelineAllowlistPolicyText()} ${getdesignReferencePolicyText()}`
      : `Design routing: UI/UX reads design.md first; if missing, use design-system-builder from docs/Design-Sys-Prompt.md with plan-tool clarification and a default font recommendation. Existing designs use design-ui-editor plus design-artifact-expert. Image/logo/raster assets use imagegen, which must prefer Codex App built-in image generation documented at ${CODEX_APP_IMAGE_GENERATION_DOC_URL}. ${CODEX_IMAGEGEN_REQUIRED_POLICY} ${getdesignReferencePolicyText()}`,
    triwikiContextTrackingText(),
    triwikiStagePolicyText(),
    stackCurrentDocsPolicyText(),
    'Extract intent, target files/surfaces, constraints, acceptance criteria, risks, and the smallest safe atomic step before acting.',
    'Do not stop at a plan when implementation was requested; continue until the route gate passes or a hard blocker is honestly recorded.',
    context7RequirementText(required),
    'Before final answer, include a user-visible completion summary that explains what changed and how it was verified, then run SKS Honest Mode: verify evidence/tests, state gaps, and confirm the goal is genuinely complete.'
  ];
  if (reflectionRequiredForRoute(route)) lines.push(reflectionInstructionText());
  if (route?.id === 'Team') lines.push(`Team route: scouts, TriWiki refresh, debate, consensus, runtime graph compile with concrete task ids and worker inboxes, close planning agents, fresh executors, minimum ${MIN_TEAM_REVIEWER_LANES}-lane review/integration, ${TEAM_SESSION_CLEANUP_ARTIFACT}, reflection, and Honest Mode. ${MIN_TEAM_REVIEW_POLICY_TEXT}`);
  if (route?.id === 'Goal') lines.push('Goal route: write SKS goal bridge artifacts, then use Codex native /goal persistence for create, pause, resume, and clear continuation controls.');
  if (route?.id === 'PPT') lines.push(`PPT route: before design or PDF work, infer and seal delivery context, audience profile including average age/job/industry, STP strategy, decision context, and at least three pain-point to solution mappings from the prompt, TriWiki/current-code defaults, and conservative policy. Keep the visual system simple, restrained, and information-first; design detail should come from hierarchy, spacing, alignment, rules, and subtle accents rather than decorative overdesign. ${pptPipelineAllowlistPolicyText()} If generated image assets or slide visual critique are needed, actively invoke the loaded imagegen skill through Codex App $imagegen/gpt-image-2 (${CODEX_APP_IMAGE_GENERATION_DOC_URL}), save the selected raster output into the mission assets/review evidence path, and record that real path before build/final. Direct API fallback, placeholders, HTML/CSS stand-ins, and prose-only substitutes do not satisfy the route gate. ${CODEX_IMAGEGEN_REQUIRED_POLICY} Then build source ledger, fact ledger, image asset ledger, storyboard with aha moments, style tokens, editable source HTML under source-html/, PDF artifact, render QA, bounded review ledger/iteration report, PPT-only temporary build file cleanup, and ppt-parallel-report.json so independent strategy/render/file-write phases stay parallel-friendly, then reflection and Honest Mode.`);
  if (route?.id === 'ImageUXReview') lines.push(`Image UX Review route: ${imageUxReviewPipelinePolicyText()} Use ${IMAGE_UX_REVIEW_POLICY_ARTIFACT}, ${IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT}, ${IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT}, ${IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT}, ${IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT}, and ${IMAGE_UX_REVIEW_GATE_ARTIFACT} as the route evidence set. The route may suggest safe fixes only when the user requested fixing; otherwise report findings and blockers.`);
  if (route?.id === 'AutoResearch') lines.push('AutoResearch route: load autoresearch-loop plus seo-geo-optimizer when SEO/GEO, discoverability, README, npm, GitHub stars, ranking, or AI-search visibility is relevant.');
  if (route?.id === 'DB') lines.push('DB route: scan/check database risk first; destructive DB operations remain forbidden.');
  if (route?.id === 'GX') lines.push('GX route: use deterministic vgraph/beta render, validate, drift, and snapshot artifacts.');
  return lines.join('\n');
}

export function dfixQuickContext(prompt, route = routePrompt(prompt)) {
  const task = stripDollarCommand(prompt) || String(prompt || '').trim();
  const routeLabel = route?.command || '$DFix';
  return [
    `DFix ultralight pipeline active. Route: ${routeLabel} (Direct Fix: tiny copy/config/docs/labels/spacing/translation/simple mechanical edits).`,
    responseLanguageInstruction(task),
    'Bypass: do not enter the general SKS prompt pipeline, mission creation, ambiguity gate, TriWiki refresh, Context7 routing, subagent orchestration, Goal, Research, eval, or broad planning.',
    `Task: ${task}`,
    'Task list:',
    '1. Infer the smallest visible Direct Fix target from the request and current files.',
    '2. Inspect only the files needed to locate that target.',
    `3. Apply only the listed Direct Fix edit; keep broad implementation routed to Team, and for UI/UX micro-edits read design.md when present and use imagegen for any image/logo/raster asset. ${CODEX_IMAGEGEN_REQUIRED_POLICY}`,
    '4. Run only cheap verification when useful, such as syntax check, focused test, or local render smoke.',
    '5. Final response: start with `DFix 완료 요약:` and include one `DFix 솔직모드:` line with verified / not verified / remaining issue status. Do not create TriWiki/TriFix/reflection/state records and do not enter repeated full-route Honest Mode loops.'
  ].join('\n');
}

export function answerOnlyContext(prompt, route = routePrompt(prompt)) {
  const task = stripDollarCommand(prompt) || String(prompt || '').trim();
  const required = routeNeedsContext7(route, task);
  return [
    `SKS answer-only pipeline active. Route: ${route?.command || '$Answer'} (${route?.route || 'answer-only research'}).`,
    responseLanguageInstruction(task),
    'Intent classification: answer/research question, not implementation. Do not create route mission state, ask ambiguity-gate questions, spawn subagents, continue active Team/Goal work, or edit files unless the user explicitly asks for implementation.',
    `Question: ${task}`,
    'Evidence flow:',
    '1. Check current repo facts and TriWiki context first; hydrate low-trust wiki claims from source paths before relying on them.',
    '2. Use web search for current, external, or uncertain facts when browsing is available or the user asks for latest/source-backed information.',
    '3. Use Context7 resolve-library-id plus query-docs when the answer depends on package, API, framework, SDK, MCP, or generated documentation behavior.',
    '4. For stack additions or version changes, preserve current-doc findings as high-priority TriWiki claims before recommending syntax or implementation.',
    `5. ${context7RequirementText(required)}`,
    '6. Finish with a clear answer summary plus Honest Mode fact-checking: separate verified facts, source-backed inferences, and remaining uncertainty.',
    'Answer directly and concisely. If the prompt is actually asking for code/work after inspection, state the re-route and use the proper execution pipeline.'
  ].join('\n');
}

export async function prepareRoute(root, prompt, state = {}) {
  const cleanPrompt = stripVisibleDecisionAnswerBlocks(prompt);
  const route = routePrompt(cleanPrompt);
  const madSksAuthorization = hasMadSksSignal(cleanPrompt);
  const task = stripDollarCommand(stripMadSksSignal(cleanPrompt)) || stripMadSksSignal(stripDollarCommand(cleanPrompt)) || String(cleanPrompt || '').trim();
  const explicit = Boolean(dollarCommand(cleanPrompt));
  if (!route) return { route: null, additionalContext: promptPipelineContext(prompt, null) };
  const dreamContext = await routeSkillDreamContext(root, route, task);
  if (route.id === 'DFix') return withSkillDreamContext(await prepareDfixQuickRoute(route, task), dreamContext);
  if (route.id === 'Answer') return withSkillDreamContext(await prepareAnswerOnlyRoute(route, task), dreamContext);
  if (route.id === 'ComputerUse') return withSkillDreamContext(await prepareComputerUseFastRoute(route, task), dreamContext);
  if (route.id === 'Wiki') return withSkillDreamContext(await prepareWikiQuickRoute(route, task), dreamContext);
  if (route.id === 'Goal') return withSkillDreamContext(await prepareGoal(root, route, task, routeNeedsContext7(route, cleanPrompt)), dreamContext);
  if (route.id === 'ImageUXReview') return withSkillDreamContext(await prepareImageUxReview(root, route, task, routeNeedsContext7(route, cleanPrompt)), dreamContext);
  const required = routeNeedsContext7(route, cleanPrompt);
  const reasoning = routeReasoning(route, cleanPrompt);
  const subagentsRequired = routeRequiresSubagents(route, cleanPrompt);
  if (QUESTION_GATE_ROUTES.has(route.id) || route.id === 'MadSKS') return withSkillDreamContext(await prepareClarificationGate(root, route, task, required, { madSksAuthorization }), dreamContext);
  if (route.id === 'Team') return withSkillDreamContext(await prepareTeam(root, route, task, required, { madSksAuthorization }), dreamContext);
  if (route.id === 'Research') return withSkillDreamContext(await prepareResearch(root, route, task, required), dreamContext);
  if (route.id === 'AutoResearch') return withSkillDreamContext(await prepareAutoResearch(root, route, task, required), dreamContext);
  if (route.id === 'DB') return withSkillDreamContext(await prepareDb(root, route, task, required), dreamContext);
  if (route.id === 'GX') return withSkillDreamContext(await prepareGx(root, route, task, required), dreamContext);
  if (explicit || required) return withSkillDreamContext(await prepareLightRoute(root, route, task, required), dreamContext);
  return withSkillDreamContext({
    route,
    additionalContext: `${promptPipelineContext(prompt, route)}\n\nReasoning: ${reasoning.effort} (${reasoning.reason}); temporary profile ${reasoning.profile}.\nRequired skills: ${route.requiredSkills.join(', ')}.\nSubagents required: ${subagentsRequired ? 'yes' : 'no'}.`
  }, dreamContext);
}

async function routeSkillDreamContext(root, route, task) {
  try {
    const result = await recordSkillDreamEvent(root, {
      route: route.id,
      command: route.command,
      required_skills: route.requiredSkills || [],
      prompt: task
    });
    if (!result.report) return '';
    return [
      'Skill dreaming threshold reached.',
      `Report: ${path.relative(root, result.report.report_path)}`,
      `Mode: ${result.report.apply_mode}; no_auto_delete=${result.report.no_auto_delete}.`,
      'Review keep/merge/prune/improve candidates before adding more generated skills.'
    ].join('\n');
  } catch (err) {
    return `Skill dreaming record failed: ${err.message || err}. Do not claim .sneakoscope/skills/dream-state.json was updated.`;
  }
}

function withSkillDreamContext(result, dreamContext) {
  if (!dreamContext) return result;
  return { ...result, additionalContext: `${result.additionalContext || ''}\n\n${dreamContext}`.trim() };
}

async function prepareDfixQuickRoute(route, task) {
  return {
    route,
    additionalContext: dfixQuickContext(task, route)
  };
}

async function prepareAnswerOnlyRoute(route, task) {
  return {
    route,
    additionalContext: answerOnlyContext(task, route)
  };
}

async function prepareComputerUseFastRoute(route, task) {
  return {
    route,
    additionalContext: computerUseFastContext(task, route)
  };
}

export function computerUseFastContext(prompt, route = routePrompt(prompt)) {
  const task = stripDollarCommand(prompt) || String(prompt || '').trim();
  return [
    `Computer Use fast lane active. Route: ${route?.command || '$Computer-Use'} (${route?.route || 'Computer Use fast lane'}).`,
    responseLanguageInstruction(task),
    'Speed contract: do not enter Team, QA-LOOP clarification, repeated upfront TriWiki refresh, Context7, subagent orchestration, debate, reflection, or broad planning unless the user explicitly requests that heavier route.',
    `Task: ${task}`,
    'Execution order:',
    '1. Infer the smallest UI/browser/visual target and acceptance from the prompt and current app context.',
    '2. Use Codex Computer Use directly for the focused screen/browser action or inspection. Do not substitute Playwright, Chrome MCP, Browser Use, Selenium, Puppeteer, or other browser automation for UI/browser evidence.',
    '3. If Computer Use is unavailable, mark UI/browser evidence unverified and stop with the exact blocker instead of switching tools.',
    '4. Apply only safe, directly requested fixes when the prompt asks for correction; otherwise report observed evidence only.',
    '5. At the end only, run `sks wiki refresh` or `sks wiki pack`, then `sks wiki validate .sneakoscope/wiki/context-pack.json` when the repo/runtime is available.',
    '6. Final response must include a short completion summary plus SKS Honest Mode: evidence used, tests/checks run, and any unverified UI/browser claims.',
    CODEX_COMPUTER_USE_ONLY_POLICY
  ].join('\n');
}

async function prepareWikiQuickRoute(route, task) {
  return {
    route,
    additionalContext: [
      `SKS wiki pipeline active. Route: ${route.command} (${route.route}).`,
      responseLanguageInstruction(task),
      `Task: ${task || 'refresh and validate TriWiki'}`,
      'Run policy: refresh/update/갱신 -> `sks wiki refresh` then validate; prune/clean/정리 -> `sks wiki refresh --prune` or dry-run prune first; pack -> `sks wiki pack` then validate.',
      stackCurrentDocsPolicyText(),
      'Report claims, anchors, trust, validation, and blockers. Do not create mission state, ask ambiguity-gate questions, spawn subagents, or run unrelated work.'
    ].join('\n')
  };
}

async function prepareImageUxReview(root, route, task, required) {
  const { id, dir, mission } = await createMission(root, { mode: 'image-ux-review', prompt: task });
  const contract = {
    prompt: task,
    answers: {
      TARGET_SURFACE: task,
      IMAGE_UX_REVIEW_SOURCE_IMAGES: []
    },
    sealed_hash: null,
    mission_id: id
  };
  const artifacts = await writeImageUxReviewRouteArtifacts(dir, contract);
  await writeJsonAtomic(path.join(dir, 'route-context.json'), {
    route: route.id,
    command: route.command,
    mode: route.mode,
    task,
    mission_id: mission.id,
    required_skills: route.requiredSkills,
    context7_required: required,
    context_tracking: triwikiContextTracking(),
    stop_gate: route.stopGate,
    artifact_policy: 'imagegen_generated_review_image_required_before_issue_extraction'
  });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'direct_route' } });
  await setCurrent(root, routeState(id, route, 'IMAGE_UX_REVIEW_READY', required, {
    prompt: task,
    implementation_allowed: true,
    ambiguity_gate_required: false,
    ambiguity_gate_passed: true,
    stop_gate: route.stopGate,
    image_ux_review_gate_ready: true,
    image_ux_review_policy_ready: true,
    pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok,
    pipeline_plan_path: PIPELINE_PLAN_ARTIFACT
  }));
  return routeContext(route, id, task, required, `Capture or attach source UI screenshots, run Codex App $imagegen/gpt-image-2 to generate annotated review images, extract those generated images into ${IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT}, then update ${IMAGE_UX_REVIEW_GATE_ARTIFACT}. ${CODEX_IMAGEGEN_REQUIRED_POLICY} Initial gate blockers: ${(artifacts.gate.blockers || []).join(', ') || 'none'}.`);
}

export async function activeRouteContext(root, state) {
  if (!state?.route && !state?.mode) return '';
  const id = state.route || state.mode;
  const reasoningNote = state.reasoning_effort ? ` Temporary reasoning remains ${state.reasoning_effort} (${state.reasoning_profile}); return to the default profile after this route completes.` : '';
  const planNote = await activePipelinePlanNote(root, state);
  if (state.honest_loop_required || /HONEST_LOOPBACK_AFTER_CLARIFICATION/.test(String(state.phase || ''))) {
    return `SKS Honest Mode found unresolved gaps for ${state.route_command || state.route || state.mode}. Do not ask ambiguity questions again. Continue from the sealed decision-contract.json, inspect .sneakoscope/missions/${state.mission_id}/honest-loopback.json, fix gaps, rerun verification, refresh/validate TriWiki, then retry final Honest Mode.${reasoningNote}${planNote}`;
  }
  if (state.clarification_required && String(state.phase || '').includes('CLARIFICATION_AWAITING_ANSWERS')) {
    return clarificationAwaitingAnswersContext(root, state);
  }
  if (state.clarification_passed && String(state.phase || '').includes('CLARIFICATION_CONTRACT_SEALED')) {
    return `Route contract sealed for ${state.route_command || state.route || state.mode}. Use decision-contract.json and ${PIPELINE_PLAN_ARTIFACT} before executing the route. Before the next route phase, read relevant TriWiki context, hydrate low-trust claims from source, and refresh/validate TriWiki again after new findings or artifact changes. Next atomic action: continue the original route lifecycle with the inferred goal, constraints, non-goals, risk boundary, and test scope.${planNote}`;
  }
  if (state.mode === 'TEAM') {
    const context7 = state.context7_required && !(await hasContext7DocsEvidence(root, state))
      ? ' Context7 evidence is still required before completion: use resolve-library-id, then query-docs (or legacy get-library-docs).'
      : '';
    const roles = state.role_counts ? ` Role counts: ${formatRoleCounts(state.role_counts)}.` : '';
    return `Active Team mission ${state.mission_id || 'latest'} must keep the user-visible live transcript updated. Agent session budget: ${state.agent_sessions || MIN_TEAM_REVIEWER_LANES}.${roles} Run scouts, TriWiki refresh, debate, consensus, fresh development, minimum ${MIN_TEAM_REVIEWER_LANES}-lane review/integration, then close or account for every Team subagent session and write ${TEAM_SESSION_CLEANUP_ARTIFACT} before reflection/final. ${MIN_TEAM_REVIEW_POLICY_TEXT} After each subagent status/result/handoff, run: sks team event ${state.mission_id || 'latest'} --agent <name> --phase <phase> --message "...". Inspect with sks team log/watch ${state.mission_id || 'latest'}.${reasoningNote}${context7}${planNote}`;
  }
  if (state.subagents_required && !(await hasSubagentEvidence(root, state))) {
    return `Active SKS route ${id} requires subagent execution evidence before code-changing work can be considered complete. Spawn worker/reviewer subagents for disjoint write scopes, or record an explicit unavailable/unsplittable subagent evidence event before editing.${reasoningNote}${planNote}`;
  }
  if (state.mode === 'GOAL') return `Active Goal mission ${state.mission_id || 'latest'} uses Codex native /goal continuation. Inspect .sneakoscope/missions/${state.mission_id || 'latest'}/${GOAL_WORKFLOW_ARTIFACT}, then use /goal create, pause, resume, or clear in the Codex runtime as appropriate.${planNote}`;
  if (state.context7_required && !(await hasContext7DocsEvidence(root, state))) {
    return `Active SKS route ${id} still requires Context7 evidence. Use resolve-library-id, then query-docs (or legacy get-library-docs) for relevant docs/APIs before completing.${reasoningNote}${planNote}`;
  }
  return planNote.trim();
}

async function activePipelinePlanNote(root, state = {}) {
  if (!state?.mission_id) return '';
  const plan = await readJson(path.join(missionDir(root, state.mission_id), PIPELINE_PLAN_ARTIFACT), null);
  if (!plan) return '';
  const lane = plan.runtime_lane?.lane || 'unknown';
  const kept = plan.stage_summary?.kept ?? plan.kept_stages?.length ?? 0;
  const skipped = plan.stage_summary?.skipped ?? plan.skipped_stages?.length ?? 0;
  const next = Array.isArray(plan.next_actions) && plan.next_actions.length ? ` Next planned action: ${plan.next_actions[0]}.` : '';
  return ` Pipeline plan: .sneakoscope/missions/${state.mission_id}/${PIPELINE_PLAN_ARTIFACT} (${lane}; kept=${kept}, skipped=${skipped}).${next}`;
}

async function prepareGoal(root, route, task, required) {
  const { id, dir, mission } = await createMission(root, { mode: 'goal', prompt: task });
  const workflow = await writeGoalWorkflow(dir, mission, { action: 'create', prompt: task });
  await writeJsonAtomic(path.join(dir, 'route-context.json'), { route: route.id, command: route.command, mode: route.mode, task, required_skills: route.requiredSkills, context7_required: required, native_goal: workflow.native_goal, stop_gate: route.stopGate });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'not_required' } });
  const executionRoute = routePrompt(task);
  const shouldDelegateExecution = routeRequiresSubagents(route, task)
    && executionRoute
    && !['Answer', 'DFix', 'Goal', 'Help'].includes(executionRoute.id);
  if (shouldDelegateExecution) {
    await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'goal.delegated_execution_route', route: executionRoute.id, command: executionRoute.command });
    const delegated = await prepareRoute(root, task, {});
    return {
      route,
      additionalContext: [
        `$Goal bridge prepared as a lightweight native /goal persistence overlay.
Goal bridge mission: ${id}
Goal artifact: .sneakoscope/missions/${id}/${GOAL_WORKFLOW_ARTIFACT}
Native Codex control: ${workflow.native_goal.slash_command}
Delegated execution route: ${executionRoute.command}. The delegated route mission is authoritative for implementation, verification, and final gates.`,
        delegated.additionalContext
      ].filter(Boolean).join('\n\n')
    };
  }
  await setCurrent(root, routeState(id, route, 'GOAL_READY', required, { prompt: task, native_goal: workflow.native_goal, stop_gate: route.stopGate, implementation_allowed: true, questions_allowed: true, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, `Use Codex native ${workflow.native_goal.slash_command} control for persisted continuation, then continue the relevant SKS route gates for any implementation work.`);
}

async function prepareClarificationGate(root, route, task, required, opts = {}) {
  const { id, dir, mission } = await createMission(root, { mode: String(route.mode || route.id || 'route').toLowerCase(), prompt: task });
  const schema = buildQuestionSchemaForRoute(route, task);
  if (opts.madSksAuthorization) applyMadSksAuthorizationToSchema(schema);
  await writeQuestions(dir, schema);
  const routeContext = { route: route.id, command: route.command, mode: route.mode, task, required_skills: route.requiredSkills, context7_required: required, original_stop_gate: route.stopGate, clarification_gate: true, mad_sks_authorization: Boolean(opts.madSksAuthorization || route.id === 'MadSKS') };
  await writeJsonAtomic(path.join(dir, 'route-context.json'), routeContext);
  {
    await writeJsonAtomic(path.join(dir, 'answers.json'), autoAnswersForSchema(schema));
    const result = await sealContract(dir, mission);
    let materialized = {};
    if (result.ok && route?.id === 'Team') {
      materialized = await materializeAutoSealedTeam(root, id, dir, route, task, result.contract?.sealed_hash || null);
      if (opts.madSksAuthorization) {
        const madSksState = await materializeMadSksAuthorization(dir, id, route, routeContext, result.contract || {});
        materialized = { ...materialized, state: { ...(materialized.state || {}), ...madSksState } };
      }
    } else if (result.ok && route?.id === 'MadSKS') {
      materialized = await materializeAutoSealedMadSks(dir, id, route, routeContext, result.contract || {});
    } else if (result.ok && route?.id === 'QALoop') {
      const artifactResult = await writeQaLoopArtifacts(dir, mission, result.contract);
      materialized = {
        phase: 'QALOOP_CLARIFICATION_CONTRACT_SEALED',
        prompt: routeContext.task || task,
        state: {
          qa_loop_artifacts_ready: true,
          qa_report_file: artifactResult.report_file,
          qa_checklist_count: artifactResult.checklist_count,
          questions_allowed: false
        }
      };
    } else if (result.ok && route?.id === 'PPT') {
      await writePptRouteArtifacts(dir, result.contract);
      materialized = {
        phase: 'PPT_AUDIENCE_STRATEGY_READY',
        prompt: routeContext.task || task,
        state: {
          ppt_audience_strategy_ready: true,
          ppt_gate_ready: true,
          questions_allowed: false
        }
      };
    }
    const effectiveTask = materialized.prompt || task;
    const plan = await writePipelinePlan(dir, { missionId: id, route, task: effectiveTask, required, ambiguity: { required: true, slots: 0, auto_sealed: result.ok, passed: result.ok, contract_hash: result.contract?.sealed_hash || null } });
    await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'route.clarification.auto_sealed', route: route.id, slots: 0, ok: result.ok });
    await setCurrent(root, routeState(id, route, result.ok ? (materialized.phase || `${route.mode}_CLARIFICATION_CONTRACT_SEALED`) : `${route.mode}_CLARIFICATION_AWAITING_ANSWERS`, required, {
      prompt: effectiveTask,
      questions_allowed: false,
      implementation_allowed: result.ok,
      clarification_required: false,
      clarification_passed: result.ok,
      ambiguity_gate_required: true,
      ambiguity_gate_passed: result.ok,
      pipeline_plan_ready: validatePipelinePlan(plan).ok,
      pipeline_plan_path: PIPELINE_PLAN_ARTIFACT,
      original_stop_gate: route.stopGate,
      stop_gate: route.stopGate,
      ...(materialized.state || {})
    }));
    const materializedLine = materialized.phase ? `\nRoute artifacts were materialized immediately; state advanced to ${materialized.phase}.` : '';
    return {
      route,
      additionalContext: `${promptPipelineContext(task, route)}

Route contract auto-sealed for ${route.command}: contract answers were inferred from the prompt, TriWiki/current-code defaults, and conservative SKS safety policy.
Mission: ${id}
Decision contract: .sneakoscope/missions/${id}/decision-contract.json
Resolved answers: .sneakoscope/missions/${id}/resolved-answers.json
Pipeline plan: .sneakoscope/missions/${id}/${PIPELINE_PLAN_ARTIFACT}
${materializedLine}
Next atomic action: continue the original route lifecycle with the sealed decision-contract.json.`
    };
  }
}

function autoAnswersForSchema(schema = {}) {
  const answers = { ...(schema.inferred_answers || {}) };
  for (const slot of schema.slots || []) {
    if (answers[slot.id] !== undefined) continue;
    if (slot.options) answers[slot.id] = slot.type === 'array' ? [slot.options[0]] : slot.options[0];
    else if (slot.type === 'array' || slot.type === 'array_or_string') answers[slot.id] = [];
    else answers[slot.id] = slot.id === 'DB_MAX_BLAST_RADIUS' ? 'no_live_dml' : 'infer_from_prompt_triwiki_and_current_code';
  }
  return answers;
}

function applyMadSksAuthorizationToSchema(schema = {}) {
  schema.domain_hints = Array.from(new Set([...(schema.domain_hints || []), 'mad-sks']));
  schema.inferred_answers = {
    ...(schema.inferred_answers || {}),
    MAD_SKS_MODE: 'explicit_invocation_only',
    DATABASE_TARGET_ENVIRONMENT: 'main_branch',
    DATABASE_WRITE_MODE: 'mad_sks_full_mcp_write_for_invocation',
    SUPABASE_MCP_POLICY: 'mad_sks_project_scoped_write_for_invocation',
    DESTRUCTIVE_DB_OPERATIONS_ALLOWED: 'mad_sks_scoped_except_catastrophic_db_wipe',
    DB_BACKUP_OR_BRANCH_REQUIRED: 'recommended_but_not_required_in_mad_sks',
    DB_MAX_BLAST_RADIUS: 'mad_sks_active_invocation_only_catastrophic_wipe_blocked',
    DB_MIGRATION_APPLY_ALLOWED: 'mad_sks_active_invocation_only',
    DB_READ_ONLY_QUERY_LIMIT: '100'
  };
  schema.inference_notes = {
    ...(schema.inference_notes || {}),
    MAD_SKS_MODE: 'explicit dollar command modifier is the permission boundary',
    DESTRUCTIVE_DB_OPERATIONS_ALLOWED: 'MAD-SKS opens live-server DB changes, Supabase MCP cleanup, direct SQL, and needed migrations while blocking only catastrophic database wipe operations'
  };
  schema.slots = (schema.slots || []).filter((slot) => !/^(DB_|DATABASE_|DESTRUCTIVE_DB_|SUPABASE_MCP_POLICY$)/.test(slot.id));
  return schema;
}

async function materializeAutoSealedMadSks(dir, id, route, routeContext = {}, contract = {}) {
  await writeJsonAtomic(path.join(dir, 'mad-sks-gate.json'), {
    schema_version: 1,
    passed: false,
    mad_sks_permission_active: true,
    permissions_deactivated: false,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    live_server_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    contract_hash: contract.sealed_hash || null
  });
  await appendJsonl(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'mad_sks.scoped_permission_opened',
    route: route?.id || 'MadSKS',
    catastrophic_safety_guard_active: true
  });
  return {
    phase: 'MADSKS_SCOPED_PERMISSION_ACTIVE',
    prompt: routeContext.task || '',
    state: {
      mad_sks_active: true,
      mad_sks_modifier: true,
      mad_sks_gate_file: 'mad-sks-gate.json',
      mad_sks_gate_ready: true,
      supabase_mcp_schema_cleanup_allowed: true,
      direct_execute_sql_allowed: true,
      normal_db_writes_allowed: true,
      live_server_writes_allowed: true,
      migration_apply_allowed: true,
      catastrophic_safety_guard_active: true
    }
  };
}

async function materializeMadSksAuthorization(dir, id, route, routeContext = {}, contract = {}) {
  if (!routeContext.mad_sks_authorization || route?.id === 'MadSKS') return {};
  const gateFile = route?.stopGate || 'done-gate.json';
  await writeJsonAtomic(path.join(dir, 'mad-sks-authorization.json'), {
    schema_version: 1,
    mission_id: id,
    route: route?.command || route?.id || null,
    status: 'active',
    active_only_for_current_route: true,
    deactivates_when_gate_passed: gateFile,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    live_server_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true,
    permission_profile: permissionGateSummary(),
    contract_hash: contract.sealed_hash || null
  });
  await appendJsonl(path.join(dir, 'events.jsonl'), {
    ts: nowIso(),
    type: 'mad_sks.modifier_authorization_opened',
    route: route?.id || null,
    gate: gateFile,
    catastrophic_safety_guard_active: true
  });
  return {
    mad_sks_active: true,
    mad_sks_modifier: true,
    mad_sks_gate_file: gateFile,
    supabase_mcp_schema_cleanup_allowed: true,
    direct_execute_sql_allowed: true,
    normal_db_writes_allowed: true,
    live_server_writes_allowed: true,
    migration_apply_allowed: true,
    catastrophic_safety_guard_active: true
  };
}

async function materializeAutoSealedTeam(root, id, dir, route, task, contractHash = null) {
  const spec = parseTeamSpecText(task);
  const cleanTask = spec.prompt || task;
  const fromChatImgRequired = hasFromChatImgSignal(cleanTask);
  const { agentSessions, roleCounts, roster } = spec;
  const plan = {
    schema_version: 1,
    mission_id: id,
    task: cleanTask,
    agent_session_count: agentSessions,
    default_agent_session_count: MIN_TEAM_REVIEWER_LANES,
    role_counts: roleCounts,
    session_policy: `Use at most ${agentSessions} subagent sessions at a time; the parent orchestrator is not counted.`,
    review_policy: teamReviewPolicy(),
    review_gate: evaluateTeamReviewPolicyGate({ roleCounts, agentSessions, roster }),
    bundle_size: roster.bundle_size,
    roster,
    goal_continuation: ambientGoalContinuation(),
    reasoning: teamReasoningPolicy(cleanTask, roster),
    contract_hash: contractHash,
    team_model: {
      phases: ['parallel_analysis_scouts', 'triwiki_stage_refresh', 'debate_team', 'runtime_task_graph', 'development_team', 'review'],
      analysis_team: `Read-only parallel scouting with exactly ${roster.bundle_size} analysis_scout_N agents.`,
      debate_team: `Read-only role debate with exactly ${roster.bundle_size} participants.`,
      development_team: `Fresh parallel development bundle with exactly ${roster.bundle_size} executor_N developers implementing disjoint slices.`,
      review_team: `Validation runs at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA lanes before integration or final.`
    },
    context_tracking: triwikiContextTracking(),
    team_runtime: teamRuntimePlanMetadata(),
    phases: [
      { id: 'team_roster_confirmation', goal: `Materialize the Team roster from default SKS counts or explicit user counts, write team-roster.json, and surface role counts ${formatRoleCounts(roleCounts)}.`, agents: ['parent_orchestrator'], output: 'team-roster.json' },
      { id: 'parallel_analysis_scouting', goal: `Read TriWiki context, then spawn exactly ${roster.bundle_size} read-only analysis_scout_N agents in parallel. ${fromChatImgRequired ? `From-Chat-IMG active: ${CODEX_COMPUTER_USE_ONLY_POLICY}` : 'From-Chat-IMG inactive: do not assume ordinary images are chat captures.'}`, agents: roster.analysis_team.map((agent) => agent.id), max_parallel_subagents: agentSessions, write_policy: 'read-only' },
      { id: 'triwiki_refresh', goal: `Refresh or pack TriWiki and run ${triwikiContextTracking().validate_command}.`, agents: ['parent_orchestrator'], output: '.sneakoscope/wiki/context-pack.json' },
      { id: 'planning_debate', goal: 'Run read-only planning debate, map constraints and implementation slices, then seal one objective.', agents: roster.debate_team.map((agent) => agent.id) },
      { id: 'runtime_task_graph_compile', goal: `Compile the agreed Team plan into ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, ${TEAM_DECOMPOSITION_ARTIFACT}, and ${TEAM_INBOX_DIR}.`, agents: ['parent_orchestrator'], output: [TEAM_GRAPH_ARTIFACT, TEAM_RUNTIME_TASKS_ARTIFACT, TEAM_DECOMPOSITION_ARTIFACT, TEAM_INBOX_DIR] },
      { id: 'parallel_implementation', goal: `Close debate agents, then spawn a fresh ${roster.bundle_size}-person executor development team with non-overlapping write ownership.`, agents: roster.development_team.map((agent) => agent.id) },
      { id: 'review_integration', goal: `${MIN_TEAM_REVIEW_POLICY_TEXT} Integrate, verify, and record evidence before final.`, agents: roster.validation_team.map((agent) => agent.id), min_reviewer_lanes: MIN_TEAM_REVIEWER_LANES },
      { id: 'session_cleanup', goal: `Close or account for Team subagent sessions and write ${TEAM_SESSION_CLEANUP_ARTIFACT}.`, agents: ['parent_orchestrator'] }
    ],
    live_visibility: {
      markdown: 'team-live.md',
      transcript: 'team-transcript.jsonl',
      dashboard: 'team-dashboard.json',
      tmux: 'CLI Team entrypoints open tmux live lanes for the visible Team agent budget when tmux is available.',
      commands: ['sks team status latest', 'sks team log latest', 'sks team tail latest', 'sks team open-tmux latest', 'sks team watch latest', 'sks team lane latest --agent <name> --follow']
    },
    required_artifacts: ['team-roster.json', 'team-analysis.md', ...(fromChatImgRequired ? [FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT] : []), 'team-consensus.md', ...teamRuntimeRequiredArtifacts(), 'team-review.md', 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'reflection.md', 'reflection-gate.json', 'team-live.md', 'team-transcript.jsonl', 'team-dashboard.json', '.sneakoscope/wiki/context-pack.json', 'context7-evidence.jsonl']
  };
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
  await writeJsonAtomic(path.join(dir, 'team-roster.json'), { schema_version: 1, mission_id: id, role_counts: roleCounts, agent_sessions: agentSessions, bundle_size: roster.bundle_size, roster, confirmed: true, source: 'auto_sealed_team_spec' });
  const contextTracking = triwikiContextTracking();
  await writeTextAtomic(path.join(dir, 'team-workflow.md'), `# SKS Team Workflow\n\nTask: ${cleanTask}\n\nAgent session budget: ${agentSessions}\nBundle size: ${roster.bundle_size}\nRole counts: ${formatRoleCounts(roleCounts)}\nReview policy: ${MIN_TEAM_REVIEW_POLICY_TEXT}\nContext tracking: ${contextTracking.ssot} SSOT, ${contextTracking.default_pack}.\n\nAuto-sealed ambiguity gate: no user question was required. Continue directly with Team scouting, debate, runtime task graph, implementation, minimum ${MIN_TEAM_REVIEWER_LANES}-lane review, cleanup, reflection, and Honest Mode.\n`);
  await initTeamLive(id, dir, cleanTask, { agentSessions, roleCounts, roster });
  const runtime = await writeTeamRuntimeArtifacts(dir, plan, { contractHash });
  await writeMemorySweepReport(root, dir, { missionId: id }).catch(() => null);
  await writeSkillForgeReport(dir, { mission_id: id, route: 'team', task_signature: cleanTask }).catch(() => null);
  await writeMistakeMemoryReport(dir, { mission_id: id, route: 'team', task: cleanTask }).catch(() => null);
  await writeCodeStructureReport(root, dir, { missionId: id, exception: 'Team auto-seal records split-review risk; extraction happens only when the mission scope includes the touched file.' }).catch(() => null);
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), {
    passed: false,
    team_roster_confirmed: true,
    analysis_artifact: false,
    triwiki_refreshed: false,
    triwiki_validated: false,
    consensus_artifact: false,
    ...runtime.gate_fields,
    implementation_team_fresh: false,
    review_artifact: false,
    integration_evidence: false,
    session_cleanup: false,
    context7_evidence: false,
    ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}),
    contract_hash: contractHash
  });
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'team.materialized_after_auto_sealed_ambiguity_gate', route: route.id, bundle_size: roster.bundle_size, agent_sessions: agentSessions });
  return {
    phase: 'TEAM_PARALLEL_ANALYSIS_SCOUTING',
    prompt: cleanTask,
    state: {
      agent_sessions: agentSessions,
      role_counts: roleCounts,
      team_roster_confirmed: true,
      team_plan_ready: true,
      team_graph_ready: runtime.ok,
      team_live_ready: true,
      from_chat_img_required: fromChatImgRequired
    }
  };
}

async function prepareTeam(root, route, task, required, opts = {}) {
  const spec = parseTeamSpecText(task);
  const cleanTask = spec.prompt || task;
  const fromChatImgRequired = hasFromChatImgSignal(cleanTask);
  const { agentSessions, roleCounts, roster } = spec;
  const { id, dir } = await createMission(root, { mode: 'team', prompt: cleanTask });
  const plan = {
    schema_version: 1,
    mission_id: id,
    task: cleanTask,
    agent_session_count: agentSessions,
    default_agent_session_count: MIN_TEAM_REVIEWER_LANES,
    role_counts: roleCounts,
    session_policy: `Use at most ${agentSessions} subagent sessions at a time; the parent orchestrator is not counted.`,
    review_policy: teamReviewPolicy(),
    review_gate: evaluateTeamReviewPolicyGate({ roleCounts, agentSessions, roster }),
    bundle_size: roster.bundle_size,
    roster,
    goal_continuation: ambientGoalContinuation(),
    reasoning: teamReasoningPolicy(cleanTask, roster),
    team_model: {
      phases: ['parallel_analysis_scouts', 'triwiki_stage_refresh', 'debate_team', 'triwiki_stage_refresh', 'runtime_task_graph', 'development_team', 'triwiki_stage_refresh', 'review'],
      analysis_team: `Read-only parallel scouting with exactly ${roster.bundle_size} analysis_scout_N agents. Each scout owns one investigation slice and returns TriWiki-ready findings with source paths, risks, and suggested implementation slices.`,
      debate_team: `Read-only role debate with exactly ${roster.bundle_size} participants composed from user, planner, reviewer, and executor voices applying compact Hyperplan-derived adversarial lenses.`,
      development_team: `Fresh parallel development bundle with exactly ${roster.bundle_size} executor_N developers implementing disjoint slices; validation_team reviews afterward.`,
      review_team: `Validation runs at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA lanes before integration or final.`
    },
    context_tracking: triwikiContextTracking(),
    team_runtime: teamRuntimePlanMetadata(),
    phases: [
      { id: 'team_roster_confirmation', goal: `Before any implementation, materialize the Team roster from default SKS counts or explicit user counts, write team-roster.json, and surface role counts ${formatRoleCounts(roleCounts)}. Implementation cannot be considered complete unless team-gate.json has team_roster_confirmed=true.`, agents: ['parent_orchestrator'], output: 'team-roster.json' },
      { id: 'parallel_analysis_scouting', goal: `Before scouting, read TriWiki context. ${fromChatImgRequired ? `From-Chat-IMG active: use Codex Computer Use visual inspection, list every visible customer request, match every screenshot image region to attachments, write ${FROM_CHAT_IMG_COVERAGE_ARTIFACT}, ${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}, and ${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}, then require scoped QA-LOOP evidence in ${FROM_CHAT_IMG_QA_LOOP_ARTIFACT} after the customer-request work is done. ${CODEX_COMPUTER_USE_ONLY_POLICY}` : `From-Chat-IMG inactive: do not assume ordinary images are chat captures. ${CODEX_COMPUTER_USE_ONLY_POLICY}`} Spawn exactly ${roster.bundle_size} read-only analysis_scout_N agents in parallel, using the full available session budget without exceeding ${agentSessions}. Split repo/docs/tests/API/user-flow/risk investigation into independent slices, hydrate relevant low-trust claims from source, and record source-backed findings.`, agents: roster.analysis_team.map((agent) => agent.id), max_parallel_subagents: agentSessions, write_policy: 'read-only' },
      { id: 'triwiki_refresh', goal: `Parent orchestrator updates Team analysis artifacts, then runs ${triwikiContextTracking().refresh_command} or ${triwikiContextTracking().pack_command}, prunes with ${triwikiContextTracking().prune_command} when stale/oversized wiki state would pollute handoffs, and runs ${triwikiContextTracking().validate_command} so the next stage uses current TriWiki context.`, agents: ['parent_orchestrator'], output: '.sneakoscope/wiki/context-pack.json' },
      { id: 'planning_debate', goal: `Before debate, read the refreshed TriWiki pack. Debate team of exactly ${roster.bundle_size} participants maps user inconvenience, options, constraints, affected files, DB/test risk, and tradeoffs while applying compact Hyperplan-derived lenses: challenge framing, subtract surface, demand evidence, test integration risk, and consider one simpler alternative. Hydrate low-trust claims from source.`, agents: roster.debate_team.map((agent) => agent.id) },
      { id: 'consensus', goal: `Seal one objective with acceptance criteria and disjoint implementation slices, then refresh/validate TriWiki so implementation receives current consensus context.` },
      { id: 'runtime_task_graph_compile', goal: `Compile the agreed Team plan into ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, and ${TEAM_DECOMPOSITION_ARTIFACT}; remap symbolic plan nodes to concrete task ids, allocate role/path/domain worker lanes, and write ${TEAM_INBOX_DIR} before executor work starts.`, agents: ['parent_orchestrator'], output: [TEAM_GRAPH_ARTIFACT, TEAM_RUNTIME_TASKS_ARTIFACT, TEAM_DECOMPOSITION_ARTIFACT, TEAM_INBOX_DIR] },
      { id: 'parallel_implementation', goal: `Before implementation, read relevant TriWiki context and current source. Close debate agents, then spawn a fresh ${roster.bundle_size}-person executor development team with non-overlapping write ownership. Refresh TriWiki after implementation changes or blockers.`, agents: roster.development_team.map((agent) => agent.id) },
      { id: 'review_integration', goal: `Before review and final output, read/validate current TriWiki context, integrate executor output, run at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes for correctness/DB safety/tests/evidence, validate user friction with validation_team, refresh after review findings, and record evidence.`, agents: roster.validation_team.map((agent) => agent.id), min_reviewer_lanes: MIN_TEAM_REVIEWER_LANES },
      { id: 'session_cleanup', goal: `Close or account for all Team subagent sessions, finalize live transcript state, and write ${TEAM_SESSION_CLEANUP_ARTIFACT} before reflection or final.`, agents: ['parent_orchestrator'] }
    ],
    live_visibility: {
      markdown: 'team-live.md',
      transcript: 'team-transcript.jsonl',
      dashboard: 'team-dashboard.json',
      tmux: 'CLI Team entrypoints open tmux live lanes for the visible Team agent budget when tmux is available.',
      commands: ['sks team status latest', 'sks team log latest', 'sks team tail latest', 'sks team open-tmux latest', 'sks team watch latest', 'sks team lane latest --agent <name> --follow', 'sks team event latest --agent <name> --phase <phase> --message "..."']
    },
    required_artifacts: ['team-roster.json', 'team-analysis.md', ...(fromChatImgRequired ? [FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT] : []), 'team-consensus.md', ...teamRuntimeRequiredArtifacts(), 'team-review.md', 'team-gate.json', TEAM_SESSION_CLEANUP_ARTIFACT, 'reflection.md', 'reflection-gate.json', 'team-live.md', 'team-transcript.jsonl', 'team-dashboard.json', '.sneakoscope/wiki/context-pack.json', 'context7-evidence.jsonl']
  };
  await writeJsonAtomic(path.join(dir, 'team-plan.json'), plan);
  await writeJsonAtomic(path.join(dir, 'team-roster.json'), { schema_version: 1, mission_id: id, role_counts: roleCounts, agent_sessions: agentSessions, bundle_size: roster.bundle_size, roster, confirmed: true, source: 'default_or_prompt_team_spec' });
  const contextTracking = triwikiContextTracking();
  await writeTextAtomic(path.join(dir, 'team-workflow.md'), `# SKS Team Workflow\n\nTask: ${cleanTask}\n\nAgent session budget: ${agentSessions}\nBundle size: ${roster.bundle_size}\nRole counts: ${formatRoleCounts(roleCounts)}\nReview policy: ${MIN_TEAM_REVIEW_POLICY_TEXT}\nReasoning: dynamic per-agent Fast reasoning; simple bounded lanes can use low, tool-heavy runtime lanes medium, and knowledge/safety/release lanes high or xhigh.\nGoal continuation: ambient Codex native /goal overlay is available when useful, without replacing Team route gates.\nContext tracking: ${contextTracking.ssot} SSOT, ${contextTracking.default_pack}; use relevant TriWiki context before every work stage, refresh/validate after findings, and preserve hydratable source anchors.\n\nAnalysis scout reasoning:\n${roster.analysis_team.map((agent) => `- ${agent.id}: ${formatAgentReasoning(agent)}`).join('\n')}\n\n1. Run exactly ${roster.bundle_size} read-only analysis_scout_N agents and write team-analysis.md.\n2. Refresh/validate TriWiki before debate.\n3. Run exactly ${roster.bundle_size} debate participants through the compact Hyperplan-derived adversarial lens pass, then write consensus and implementation slices.\n4. Compile ${TEAM_GRAPH_ARTIFACT}, ${TEAM_RUNTIME_TASKS_ARTIFACT}, ${TEAM_DECOMPOSITION_ARTIFACT}, and ${TEAM_INBOX_DIR} so worker handoff uses concrete runtime task ids.\n5. Close debate agents before starting a fresh ${roster.bundle_size}-person executor team.\n6. Run at least ${MIN_TEAM_REVIEWER_LANES} independent reviewer/QA validation lanes, integrate, verify, and record evidence.\n7. Close/clean remaining Team sessions, finalize live transcript state, and write ${TEAM_SESSION_CLEANUP_ARTIFACT} before reflection/final.\n\nNo unrequested fallback implementation code is allowed in any stage, executor lane, review lane, MAD route, or MAD-SKS route. If the requested path cannot be implemented inside the sealed contract, block with evidence instead of adding substitute behavior.\n\nLive visibility:\n- sks team log ${id}\n- sks team tail ${id}\n- sks team watch ${id}\n- sks team lane ${id} --agent analysis_scout_1 --follow\n- sks team event ${id} --agent <name> --phase <phase> --message \"...\"\n`);
  await initTeamLive(id, dir, cleanTask, { agentSessions, roleCounts, roster });
  const runtime = await writeTeamRuntimeArtifacts(dir, plan, {});
  await writeMemorySweepReport(root, dir, { missionId: id }).catch(() => null);
  await writeSkillForgeReport(dir, { mission_id: id, route: 'team', task_signature: cleanTask }).catch(() => null);
  await writeMistakeMemoryReport(dir, { mission_id: id, route: 'team', task: cleanTask }).catch(() => null);
  await writeCodeStructureReport(root, dir, { missionId: id, exception: 'Team prepare records split-review risk; extraction happens only when the mission scope includes the touched file.' }).catch(() => null);
  await writeJsonAtomic(path.join(dir, 'team-gate.json'), { passed: false, team_roster_confirmed: true, analysis_artifact: false, triwiki_refreshed: false, triwiki_validated: false, consensus_artifact: false, ...runtime.gate_fields, implementation_team_fresh: false, review_artifact: false, integration_evidence: false, session_cleanup: false, context7_evidence: false, ...(fromChatImgRequired ? { from_chat_img_required: true, from_chat_img_request_coverage: false } : {}) });
  const madSksState = opts.madSksAuthorization
    ? await materializeMadSksAuthorization(dir, id, route, { mad_sks_authorization: true }, {})
    : {};
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task: cleanTask, required, ambiguity: { required: false, status: 'direct_team_cli' } });
  await setCurrent(root, routeState(id, route, 'TEAM_PARALLEL_ANALYSIS_SCOUTING', required, { prompt: cleanTask, implementation_allowed: true, ambiguity_gate_required: false, ambiguity_gate_passed: true, agent_sessions: agentSessions, role_counts: roleCounts, team_roster_confirmed: true, team_plan_ready: true, team_graph_ready: runtime.ok, context_tracking: 'triwiki', from_chat_img_required: fromChatImgRequired, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT, ...madSksState }));
  return routeContext(route, id, cleanTask, required, `Run scouts, refresh/validate TriWiki, debate, close debate agents, form a fresh ${roster.bundle_size}-person executor team, run minimum ${MIN_TEAM_REVIEWER_LANES}-lane review/integration, then close/clean Team sessions and write ${TEAM_SESSION_CLEANUP_ARTIFACT} before reflection.`);
}

async function prepareResearch(root, route, task, required) {
  const { id, dir } = await createMission(root, { mode: 'research', prompt: task });
  await writeResearchPlan(dir, task, {});
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'direct_route' } });
  await setCurrent(root, routeState(id, route, 'RESEARCH_PREPARED', required, { prompt: task, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, 'Run sks research run latest as a real long-running source-gathering pass, never an automatic mock fallback; do not modify repository source code; create research-source-skill.md, maximize layered public source search, require every scout effort=xhigh plus one Eureka! idea, repeat scout/debate/falsification cycles until unanimous_consensus=true for every scout or the explicit safety cap pauses the run, fill source-ledger.json, scout-ledger.json, debate-ledger.json, novelty-ledger.json, falsification-ledger.json, research-report.md, research-paper.md, genius-opinion-summary.md, and pass research-gate.json.');
}

async function prepareAutoResearch(root, route, task, required) {
  const { id, dir } = await createMission(root, { mode: 'autoresearch', prompt: task });
  await writeJsonAtomic(path.join(dir, 'autoresearch-plan.json'), { schema_version: 1, task, loop: ['program', 'hypothesis', 'experiment', 'measure', 'keep_or_discard', 'falsify', 'honest_conclusion'] });
  await writeJsonAtomic(path.join(dir, 'experiment-ledger.json'), { schema_version: 1, entries: [] });
  await writeJsonAtomic(path.join(dir, 'autoresearch-gate.json'), { passed: false, experiment_ledger_present: true, metric_present: false, keep_or_discard_decision: false, falsification_present: false, honest_conclusion: false, context7_evidence: false });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'direct_route' } });
  await setCurrent(root, routeState(id, route, 'AUTORESEARCH_EXPERIMENT_LOOP', required, { prompt: task, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, 'Run the smallest useful experiment loop, update experiment-ledger.json, falsify the result, and pass autoresearch-gate.json.');
}

async function prepareDb(root, route, task, required) {
  const { id, dir } = await createMission(root, { mode: 'db', prompt: task });
  const scan = await scanDbSafety(root).catch((err) => ({ ok: false, findings: [{ id: 'db_scan_failed', severity: 'high', reason: err.message }] }));
  await writeJsonAtomic(path.join(dir, 'db-safety-scan.json'), scan);
  await writeJsonAtomic(path.join(dir, 'db-review.json'), { passed: false, scan_ok: scan.ok, destructive_operation_zero: true, safe_mcp_policy: false, context7_evidence: false, notes: [] });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'direct_route' } });
  await setCurrent(root, routeState(id, route, 'DB_REVIEW_REQUIRED', required, { prompt: task, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, 'Run sks db policy/scan/check as needed, keep DB operations read-only, record safe MCP policy, and pass db-review.json.');
}

async function prepareGx(root, route, task, required) {
  const { id, dir } = await createMission(root, { mode: 'gx', prompt: task });
  await writeJsonAtomic(path.join(dir, 'gx-gate.json'), { passed: false, vgraph_beta_render: false, validation: false, drift_snapshot: false, context7_evidence: false });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'direct_route' } });
  await setCurrent(root, routeState(id, route, 'GX_VALIDATE_REQUIRED', required, { prompt: task, pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, 'Run sks gx init/render/validate/drift/snapshot, then pass gx-gate.json.');
}

async function prepareLightRoute(root, route, task, required) {
  const { id, dir } = await createMission(root, { mode: route.id.toLowerCase(), prompt: task });
  await writeJsonAtomic(path.join(dir, 'route-context.json'), { route: route.id, command: route.command, task, required_skills: route.requiredSkills, context7_required: required, context_tracking: triwikiContextTracking(), stop_gate: 'honest_mode' });
  const pipelinePlan = await writePipelinePlan(dir, { missionId: id, route, task, required, ambiguity: { required: false, status: 'light_route' } });
  await setCurrent(root, routeState(id, route, 'ROUTE_CONTEXT_READY', required, { prompt: task, stop_gate: 'none', pipeline_plan_ready: validatePipelinePlan(pipelinePlan).ok, pipeline_plan_path: PIPELINE_PLAN_ARTIFACT }));
  return routeContext(route, id, task, required, 'Load the route skill context, execute the smallest matching action, and finish with Honest Mode.');
}

function routeState(id, route, phase, context7Required, extra = {}) {
  const reasoning = routeReasoning(route, extra.prompt || '');
  const subagentsRequired = routeRequiresSubagents(route, extra.prompt || '');
  return { mission_id: id, route: route.id, route_command: route.command, mode: route.mode, phase, context7_required: context7Required, context7_verified: false, subagents_required: subagentsRequired, subagents_verified: false, reflection_required: reflectionRequiredForRoute(route), visible_progress_required: true, context_tracking: 'triwiki', required_skills: route.requiredSkills, stop_gate: route.stopGate, reasoning_effort: reasoning.effort, reasoning_profile: reasoning.profile, reasoning_temporary: true, goal_continuation: ambientGoalContinuation(), ...extra };
}

function routeContext(route, id, task, required, next) {
  const visibleTask = stripVisibleDecisionAnswerBlocks(task);
  return {
    route,
    additionalContext: `${promptPipelineContext(visibleTask, route)}

${route.command} route prepared.
Mission: ${id}
Task: ${visibleTask}
Pipeline plan: .sneakoscope/missions/${id}/${PIPELINE_PLAN_ARTIFACT}
Required skills: ${route.requiredSkills.join(', ')}
Stop gate: ${route.stopGate}
Subagents: ${routeRequiresSubagents(route, visibleTask) ? 'required before code-changing execution; spawn parallel workers/reviewers with disjoint ownership or record explicit unavailable/unsplittable evidence.' : 'optional'}
TriWiki: use only the latest coordinate+voxel-overlay context pack before each route phase, hydrate low-trust claims during the phase, refresh after new findings or artifact changes, and validate before handoffs/final claims. Coordinate-only legacy packs are invalid and must be refreshed before pipeline decisions.
Final closeout: every pipeline final answer must summarize what was done, what changed for the user/repo, what was verified, and any remaining gaps.
${reflectionRequiredForRoute(route) ? `Reflection: ${reflectionInstructionText()}` : 'Reflection: not required for this lightweight route.'}
Reasoning: ${routeReasoning(route, visibleTask).effort} temporary; return to default after completion.
Goal continuation: ambient /goal overlay may be used for persistence when it helps completion, but route gates remain authoritative.
Next atomic action: ${next}`
  };
}

async function clarificationAwaitingAnswersContext(root, state) {
  const id = state.mission_id;
  if (!id) return '';
  const planNote = await activePipelinePlanNote(root, state);
  return `Active SKS route ${state.route_command || state.route || state.mode} is paused at its ambiguity gate and waiting for explicit user answers. Do not advance to implementation, tests, route materialization, or a new pipeline stage. If the user's reply is now available, seal it with "sks pipeline answer ${id} --stdin"; otherwise show only the missing slot ids from .sneakoscope/missions/${id}/questions.md and wait.${planNote}`;
}

function clarificationVisibleResponseContract(id) {
  const answerCommand = `sks pipeline answer ${id} --stdin`;
  return `

VISIBLE RESPONSE CONTRACT:
- This is stale compatibility text for old missions only.
- Do not show a prequestion sheet in chat.
- Seal internally with inferred answers using \`${answerCommand}\`, or re-prepare the current prompt so the route auto-seals.`;
}

function clarificationPlanHint(route, id) {
  const command = `sks pipeline answer ${id} --stdin`;
  return `

Codex plan-tool interaction:
Use update_plan only for real execution work:
- in_progress: Auto-seal inferred route contract for ${route.command || '$SKS'}
- pending: Continue the original route lifecycle with decision-contract.json
Do not surface a prequestion sheet. Legacy answer command if needed: \`${command}\`.`;
}

function formatRequiredQuestions(schema) {
  return schema.slots.map((s, i) => {
    const options = s.options ? ` Options: ${s.options.join(', ')}.` : '';
    const examples = s.examples ? ` Examples: ${s.examples.join(', ')}.` : '';
    return `${i + 1}. ${s.id}: ${s.question}${options}${examples}`;
  }).join('\n');
}

async function clarificationStopReason(root, state, kind) {
  const id = state?.mission_id || 'latest';
  const routeName = state?.route_command || state?.route || state?.mode || 'route';
  const files = state?.mission_id ? `
Answer schema: .sneakoscope/missions/${state.mission_id}/required-answers.schema.json` : '';
  const command = `sks pipeline answer ${id} --stdin`;
  const title = `SKS ${routeName} is paused for explicit user answers.`;
  return `${title}
Do not continue to implementation or the next pipeline stage until the ambiguity gate is sealed. Ask only the missing slot ids if they have not already been shown, then wait for the user. When the user's reply is available, seal it with "${command}".${files}

After the contract is sealed, continue the original ${routeName} route.`;
}

export async function recordContext7Evidence(root, state, payload) {
  const stage = context7Stage(payload);
  if (!stage) return null;
  if (!await shouldWritePipelineEvidence(root, state)) return null;
  const record = { ts: nowIso(), stage, tool: context7ToolName(payload), payload_keys: Object.keys(payload || {}).sort() };
  const id = state?.mission_id;
  const file = id ? path.join(missionDir(root, id), 'context7-evidence.jsonl') : path.join(root, '.sneakoscope', 'state', 'context7-evidence.jsonl');
  await appendJsonl(file, record);
  if (id) {
    const evidence = await context7Evidence(root, state);
    await setCurrent(root, { context7_resolved: evidence.resolve, context7_docs: evidence.docs, context7_verified: evidence.ok });
  }
  return record;
}

export async function recordSubagentEvidence(root, state, payload) {
  const stage = subagentStage(payload);
  if (!stage) return null;
  if (!await shouldWritePipelineEvidence(root, state)) return null;
  const record = { ts: nowIso(), stage, tool: subagentToolName(payload), payload_keys: Object.keys(payload || {}).sort() };
  const id = state?.mission_id;
  const file = id ? path.join(missionDir(root, id), 'subagent-evidence.jsonl') : path.join(root, '.sneakoscope', 'state', 'subagent-evidence.jsonl');
  await appendJsonl(file, record);
  if (id) {
    const evidence = await subagentEvidence(root, state);
    await setCurrent(root, { subagents_spawned: evidence.spawn, subagents_reported: evidence.result, subagents_verified: evidence.ok });
  }
  return record;
}

async function shouldWritePipelineEvidence(root, state = {}) {
  if (state?.mission_id) return exists(missionDir(root, state.mission_id));
  return exists(path.join(root, '.sneakoscope', 'state', 'current.json'));
}

function subagentToolName(payload) {
  const obj = payload || {};
  return String(obj.tool_name || obj.name || obj.tool?.name || obj.mcp_tool || obj.command || obj.type || '');
}

function subagentStage(payload) {
  const hay = JSON.stringify(payload || {});
  if (!/(spawn_agent|send_input|wait_agent|close_agent|subagent|worker|explorer)/i.test(hay)) return null;
  if (/subagent[_ -]?unavailable|subagents unavailable|unsafe to split|unsplittable|cannot safely split/i.test(hay)) return 'exception';
  if (/spawn_agent/i.test(hay)) return 'spawn_agent';
  if (/wait_agent|close_agent|completed|final/i.test(hay)) return 'result';
  return 'subagent';
}

export async function subagentEvidence(root, state) {
  const id = state?.mission_id;
  if (!id) return { spawn: false, result: false, exception: false, ok: false, count: 0 };
  const text = await readText(path.join(missionDir(root, id), 'subagent-evidence.jsonl'), '');
  const lines = text.split(/\n/).filter(Boolean);
  let spawn = false;
  let result = false;
  let exception = false;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.stage === 'spawn_agent') spawn = true;
      if (entry.stage === 'result') result = true;
      if (entry.stage === 'exception') exception = true;
    } catch {}
  }
  return { spawn, result, exception, ok: spawn || exception, count: lines.length };
}

export async function hasSubagentEvidence(root, state) {
  return (await subagentEvidence(root, state)).ok;
}

function context7ToolName(payload) {
  const obj = payload || {};
  return String(obj.tool_name || obj.name || obj.tool?.name || obj.mcp_tool || obj.command || obj.type || '');
}

function context7Stage(payload) {
  const hay = JSON.stringify(payload || {});
  if (!/(context7|resolve[-_]?library[-_]?id|get[-_]?library[-_]?docs|query[-_]?docs)/i.test(hay)) return null;
  if (/resolve[-_]?library[-_]?id/i.test(hay)) return 'resolve-library-id';
  if (/get[-_]?library[-_]?docs|query[-_]?docs/i.test(hay)) return 'get-library-docs';
  return 'context7';
}

export async function context7Evidence(root, state) {
  const id = state?.mission_id;
  if (!id) return { resolve: false, docs: false, ok: false, count: 0 };
  const text = await readText(path.join(missionDir(root, id), 'context7-evidence.jsonl'), '');
  const lines = text.split(/\n/).filter(Boolean);
  let resolve = false;
  let docs = false;
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (entry.stage === 'resolve-library-id') resolve = true;
      if (entry.stage === 'get-library-docs') docs = true;
    } catch {}
  }
  return { resolve, docs, ok: resolve && docs, count: lines.length };
}

export async function hasContext7DocsEvidence(root, state) {
  return (await context7Evidence(root, state)).ok;
}

function reflectionRequiredForState(state = {}) {
  if (state.reflection_required === false) return false;
  if (state.reflection_required === true) return true;
  return reflectionRequiredForRoute(state.route || state.mode || state.route_command);
}

async function reflectionGateStatus(root, state = {}) {
  if (!reflectionRequiredForState(state)) return { ok: true, missing: [] };
  const id = state?.mission_id;
  if (!id) return { ok: false, missing: ['mission_id'] };
  const dir = missionDir(root, id);
  const gate = await readJson(path.join(dir, REFLECTION_GATE), null);
  if (!gate) return { ok: false, missing: [REFLECTION_GATE] };
  const hasArtifact = gate.reflection_artifact === true && await exists(path.join(dir, REFLECTION_ARTIFACT));
  const hasLesson = gate.lessons_recorded === true || (Array.isArray(gate.lessons) && gate.lessons.length > 0);
  const noIssue = gate.no_issue_acknowledged === true;
  const hasMemory = gate.triwiki_recorded === true || gate.memory_recorded === true;
  const missing = [];
  if (gate.passed !== true) missing.push('passed');
  if (!hasArtifact) missing.push(REFLECTION_ARTIFACT);
  if (!hasLesson && !noIssue) missing.push('lessons_recorded_or_no_issue_acknowledged');
  if (hasLesson && !hasMemory) missing.push('triwiki_recorded');
  if (hasMemory && !(await exists(path.join(root, REFLECTION_MEMORY_PATH)))) missing.push(REFLECTION_MEMORY_PATH);
  if (gate.wiki_refreshed_or_packed !== true && gate.triwiki_refreshed !== true) missing.push('wiki_refreshed_or_packed');
  if (gate.wiki_validated !== true) missing.push('wiki_validated');
  missing.push(...await staleReflectionReasons(root, state, gate));
  return { ok: missing.length === 0, missing };
}

async function staleReflectionReasons(root, state = {}, gate = {}) {
  const created = Date.parse(gate.created_at || gate.updated_at || '');
  if (!Number.isFinite(created)) return ['reflection-gate:created_at'];
  const id = state?.mission_id;
  if (!id) return [];
  const dir = missionDir(root, id);
  const missing = [];
  for (const file of gateFilesForState(state).filter((file) => file && !['none', 'honest_mode'].includes(file))) {
    if (await fileUpdatedAfter(path.join(dir, file), created)) missing.push(`${file}:updated_after_reflection`);
  }
  const transcript = await readText(path.join(dir, 'team-transcript.jsonl'), '');
  const newerWorkEvent = transcript
    .split(/\n/)
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .find((event) => {
      const ts = Date.parse(event?.ts || '');
      if (!Number.isFinite(ts) || ts <= created) return false;
      return !/^(REFLECTION|HONEST|TEAM_CLEANUP)$/i.test(String(event?.phase || ''));
    });
  if (newerWorkEvent) missing.push('team-transcript.jsonl:work_after_reflection');
  return missing;
}

async function fileUpdatedAfter(file, timeMs) {
  try {
    const stat = await fsp.stat(file);
    return stat.mtimeMs > timeMs + 1000;
  } catch {
    return false;
  }
}

function reflectionStopReason(state = {}, status = {}) {
  const id = state?.mission_id || 'latest';
  const route = String(state.route_command || state.route || state.mode || 'route');
  const missing = status.missing?.length ? ` Missing: ${status.missing.join(', ')}.` : '';
  return `SKS ${route} must run reflection before final. Write .sneakoscope/missions/${id}/${REFLECTION_ARTIFACT}, record real lessons in ${REFLECTION_MEMORY_PATH} when present, refresh/pack and validate TriWiki, then pass .sneakoscope/missions/${id}/${REFLECTION_GATE}.${missing}`;
}

export async function projectGateStatus(root, state = {}) {
  const gates = [];
  const id = state?.mission_id || null;
  if (clarificationGatePending(state)) {
    gates.push({
      id: 'clarification-gate',
      ok: false,
      missing: ['explicit_user_answers', 'pipeline_answer'],
      source: id ? `.sneakoscope/missions/${id}/questions.md` : null
    });
  }
  if (state?.context7_required) {
    const evidence = await context7Evidence(root, state);
    gates.push({
      id: 'context7-evidence',
      ok: evidence.ok,
      missing: evidence.ok ? [] : ['resolve-library-id', 'query-docs'],
      source: id ? `.sneakoscope/missions/${id}/context7-evidence.jsonl` : '.sneakoscope/state/context7-evidence.jsonl'
    });
  }
  if (state?.subagents_required) {
    const evidence = await subagentEvidence(root, state);
    gates.push({
      id: 'subagent-evidence',
      ok: evidence.ok,
      missing: evidence.ok ? [] : ['spawn_agent_or_exception_evidence'],
      source: id ? `.sneakoscope/missions/${id}/subagent-evidence.jsonl` : '.sneakoscope/state/subagent-evidence.jsonl'
    });
  }
  if (id && state?.stop_gate && !['none', 'honest_mode', 'clarification-gate'].includes(state.stop_gate)) {
    const active = await passedActiveGate(root, state);
    gates.push({
      id: active.file || state.stop_gate,
      ok: active.ok,
      missing: active.missing || (active.ok ? [] : ['passed']),
      source: active.file ? `.sneakoscope/missions/${id}/${active.file}` : null
    });
  }
  const mistakeRecall = await mistakeRecallGateStatus(root, state);
  if (id && (!mistakeRecall.ok || mistakeRecall.source)) {
    gates.push({
      id: MISTAKE_RECALL_ARTIFACT,
      ok: mistakeRecall.ok,
      missing: mistakeRecall.missing || [],
      source: `.sneakoscope/missions/${id}/${MISTAKE_RECALL_ARTIFACT}`
    });
  }
  const reflection = await reflectionGateStatus(root, state);
  if (reflectionRequiredForState(state)) {
    gates.push({
      id: REFLECTION_GATE,
      ok: reflection.ok,
      missing: reflection.missing || [],
      source: id ? `.sneakoscope/missions/${id}/${REFLECTION_GATE}` : null
    });
  }
  const blockers = gates.filter((gate) => !gate.ok).flatMap((gate) => gate.missing.map((item) => `${gate.id}:${item}`));
  return {
    schema_version: 1,
    generated_at: nowIso(),
    mission_id: id,
    mode: state?.mode || null,
    report_only: true,
    ok: blockers.length === 0,
    blockers,
    gates
  };
}

export async function evaluateStop(root, state, payload, opts = {}) {
  const last = extractLastMessage(payload);
  if (clarificationGatePending(state)) {
    if (await hasVisibleClarificationQuestionBlock(root, state, last)) return { continue: true };
    return {
      decision: 'block',
      reason: await clarificationStopReason(root, state, 'route'),
      gate: 'clarification',
      missing: ['explicit_user_answers', 'pipeline_answer']
    };
  }
  if (state?.context7_required && !(await hasContext7DocsEvidence(root, state))) {
    return complianceBlock(root, state, `SKS ${state.route_command || state.mode || 'route'} requires Context7 evidence before completion. Use Context7 resolve-library-id, then query-docs (or legacy get-library-docs), so SKS can record context7-evidence.jsonl.`, { gate: 'context7-evidence' });
  }
  if (state?.subagents_required && !(await hasSubagentEvidence(root, state))) {
    return complianceBlock(root, state, `SKS ${state.route_command || state.mode || 'route'} requires subagent execution evidence before completion. Spawn worker/reviewer subagents for disjoint code-changing work, or record explicit evidence that subagents were unavailable or unsafe to split.`, { gate: 'subagent-evidence' });
  }
  const mistakeRecall = await mistakeRecallGateStatus(root, state);
  if (!mistakeRecall.ok) {
    return complianceBlock(root, state, `SKS ${state.route_command || state.mode || 'route'} found relevant TriWiki mistake memory that is not bound to the decision contract. Re-run pipeline answer or seal the contract so ${MISTAKE_RECALL_ARTIFACT} is consumed before finishing.`, { gate: MISTAKE_RECALL_ARTIFACT, missing: mistakeRecall.missing });
  }
  if (opts.noQuestion) {
    if (containsUserQuestion(last)) return complianceBlock(root, state, noQuestionContinuationReason(), { gate: 'no-question' });
    const gate = await passedActiveGate(root, state);
    if (gate.ok) {
      const reflection = await reflectionGateStatus(root, state);
      if (!reflection.ok) return complianceBlock(root, state, reflectionStopReason(state, reflection), { gate: 'reflection', missing: reflection.missing });
      return { continue: true };
    }
    const missing = gate.missing?.length ? ` Missing gate fields: ${gate.missing.join(', ')}.` : '';
    return complianceBlock(root, state, `SKS no-question run is not done. Continue autonomously, fix failing checks, update ${gate.file || 'the active gate file'}, and do not ask the user.${missing}`, { gate: gate.file || 'active-gate', missing: gate.missing });
  }
  if (state?.mission_id && state?.stop_gate && !['none', 'honest_mode', 'clarification-gate'].includes(state.stop_gate)) {
    const gate = await passedActiveGate(root, state);
    if (!gate.ok) {
      const missing = gate.missing?.length ? ` Missing gate fields: ${gate.missing.join(', ')}.` : '';
      return complianceBlock(root, state, `SKS ${state.route_command || state.mode} route cannot stop yet. Pass ${gate.file || state.stop_gate} or record a hard blocker with evidence before finishing.${missing}`, { gate: gate.file || state.stop_gate, missing: gate.missing });
    }
  }
  const proofGate = await routeProofGateStatus(root, state);
  if (!proofGate.ok) {
    return complianceBlock(root, state, `SKS ${state.route_command || state.mode || 'route'} route cannot finalize without a valid Completion Proof. Missing or invalid proof issues: ${proofGate.issues.join(', ')}.`, { gate: 'completion-proof', missing: proofGate.issues });
  }
  const reflection = await reflectionGateStatus(root, state);
  if (!reflection.ok) return complianceBlock(root, state, reflectionStopReason(state, reflection), { gate: 'reflection', missing: reflection.missing });
  return null;
}

async function routeProofGateStatus(root, state = {}) {
  const route = routeFromState(state);
  const required = state.proof_required === true || routeRequiresCompletionProof(route);
  if (!required || !state?.mission_id) return { ok: true, required: false, issues: [] };
  return validateRouteCompletionProof(root, {
    missionId: state.mission_id,
    route,
    state,
    visualClaim: state.visual_claim !== false
  });
}

function clarificationGatePending(state = {}) {
  const phase = String(state.phase || '');
  return Boolean(state?.clarification_required && phase.includes('CLARIFICATION_AWAITING_ANSWERS'))
    || Boolean(
      state?.mission_id
      && state.implementation_allowed === false
      && state.ambiguity_gate_required === true
      && state.ambiguity_gate_passed !== true
      && (phase.includes('CLARIFICATION_AWAITING_ANSWERS') || state.stop_gate === 'clarification-gate')
    );
}

async function complianceBlock(root, state = {}, reason = '', detail = {}) {
  if (!state?.mission_id) return { decision: 'block', reason };
  const dir = missionDir(root, state.mission_id);
  const guardPath = path.join(dir, COMPLIANCE_LOOP_GUARD_ARTIFACT);
  const normalized = normalizeComplianceReason(reason);
  const previous = await readJson(guardPath, {});
  const count = previous.normalized_reason === normalized ? Number(previous.repeat_count || 0) + 1 : 1;
  const limit = complianceLoopLimit();
  const record = {
    schema_version: 1,
    updated_at: nowIso(),
    mission_id: state.mission_id,
    route: state.route_command || state.route || state.mode || null,
    gate: detail.gate || state.stop_gate || null,
    normalized_reason: normalized,
    repeat_count: count,
    limit,
    tripped: count >= limit,
    last_reason: reason,
    missing: Array.isArray(detail.missing) ? detail.missing : []
  };
  await writeJsonAtomic(guardPath, record);
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'pipeline.compliance_loop_guard', gate: record.gate, repeat_count: count, limit, tripped: record.tripped, missing: record.missing });
  if (!record.tripped) return { decision: 'block', reason };
  await writeJsonAtomic(path.join(dir, HARD_BLOCKER_ARTIFACT), {
    passed: true,
    created_at: nowIso(),
    reason: 'compliance_loop_guard_tripped',
    route: record.route,
    gate: record.gate,
    repeat_count: count,
    limit,
    original_reason: reason,
    evidence: [
      `${COMPLIANCE_LOOP_GUARD_ARTIFACT}: repeated identical compliance stop reason ${count} time(s)`,
      'Pipeline stopped as a hard blocker instead of looping indefinitely; no completion success is claimed.'
    ]
  });
  await appendJsonl(path.join(dir, 'events.jsonl'), { ts: nowIso(), type: 'pipeline.compliance_loop_guard.tripped', gate: record.gate, repeat_count: count, limit });
  return null;
}

function complianceLoopLimit() {
  const raw = Number.parseInt(process.env.SKS_COMPLIANCE_LOOP_LIMIT || '', 10);
  if (!Number.isFinite(raw)) return DEFAULT_COMPLIANCE_LOOP_LIMIT;
  return Math.max(1, Math.min(20, raw));
}

function normalizeComplianceReason(reason = '') {
  return String(reason || '')
    .replace(/\bM-\d{8}-\d{6}-[a-z0-9]+\b/gi, 'M-*')
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/g, 'TIMESTAMP')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function passedActiveGate(root, state) {
  const id = state?.mission_id;
  if (!id) return { ok: false, file: null };
  const hardBlocker = await passedHardBlocker(root, state);
  if (hardBlocker.ok) return hardBlocker;
  const files = gateFilesForState(state);
  for (const file of files) {
    const p = path.join(missionDir(root, id), file);
    if (await exists(p)) {
      const gate = await readJson(p, {});
      const missing = [
        ...missingRequiredGateFields(file, state, gate),
        ...await missingRequiredGateArtifacts(root, file, state, gate)
      ];
      if (gate.passed === true && !missing.length) return { ok: true, file };
      if (missing.length) return { ok: false, file, missing };
      return { ok: false, file };
    }
  }
  return { ok: false, file: files[0] || null };
}

async function passedHardBlocker(root, state) {
  if (!state?.mission_id) return { ok: false };
  const file = 'hard-blocker.json';
  const blocker = await readJson(path.join(missionDir(root, state.mission_id), file), null);
  if (!blocker) return { ok: false };
  return { ok: blocker.passed === true && String(blocker.reason || '').trim() && Array.isArray(blocker.evidence) && blocker.evidence.length > 0, file };
}

function missingRequiredGateFields(file, state, gate = {}) {
  const mode = String(state?.mode || '').toUpperCase();
  if (file === 'team-gate.json' || mode === 'TEAM') {
    const required = ['team_roster_confirmed', 'analysis_artifact', 'triwiki_refreshed', 'triwiki_validated', 'consensus_artifact', 'implementation_team_fresh', 'review_artifact', 'integration_evidence', 'session_cleanup'];
    if (fromChatImgCoverageRequired(state, gate)) required.push('from_chat_img_request_coverage');
    if (teamGraphRequired(state, gate)) required.push('team_graph_compiled', 'runtime_dependencies_concrete', 'worker_inboxes_written', 'write_scope_conflicts_zero', 'task_claim_readiness_checked');
    return required
      .filter((key) => gate[key] !== true);
  }
  if (file === 'qa-gate.json' || mode === 'QALOOP') {
    return ['clarification_contract_sealed', 'qa_report_written', 'qa_ledger_complete', 'checklist_completed', 'safety_reviewed', 'deployed_destructive_tests_blocked', 'credentials_not_persisted', 'ui_computer_use_evidence', 'honest_mode_complete']
      .filter((key) => gate[key] !== true);
  }
  if (file === 'ppt-gate.json' || mode === 'PPT') {
    const required = [...PPT_REQUIRED_GATE_FIELDS];
    if (Number(gate.painpoint_count || 0) < 3) required.push('painpoint_count>=3');
    return required.filter((key) => {
      if (key === 'painpoint_count>=3') return Number(gate.painpoint_count || 0) < 3;
      return gate[key] !== true;
    });
  }
  if (file === IMAGE_UX_REVIEW_GATE_ARTIFACT || mode === 'IMAGE_UX_REVIEW') {
    return IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS.filter((key) => gate[key] !== true);
  }
  return [];
}

async function missingRequiredGateArtifacts(root, file, state, gate = {}) {
  const mode = String(state?.mode || '').toUpperCase();
  if (file === 'research-gate.json' || mode === 'RESEARCH') {
    const evaluated = await evaluateResearchGate(missionDir(root, state.mission_id));
    if (evaluated.passed === true) return [];
    return (evaluated.reasons || ['research_gate_blocked']).map((reason) => `research-gate:${reason}`);
  }
  if (file === IMAGE_UX_REVIEW_GATE_ARTIFACT || mode === 'IMAGE_UX_REVIEW') return missingImageUxReviewArtifacts(root, state, gate);
  if (file !== 'team-gate.json' && mode !== 'TEAM') return [];
  const missing = [];
  if (gate.team_roster_confirmed === true && !(await exists(path.join(missionDir(root, state.mission_id), 'team-roster.json')))) missing.push('team-roster.json');
  if (teamGraphRequired(state, gate) && gate.team_graph_compiled === true) {
    const validation = await validateTeamRuntimeArtifacts(missionDir(root, state.mission_id));
    if (!validation.ok) missing.push(...validation.issues.map((issue) => `team-runtime:${issue}`));
  }
  if (fromChatImgCoverageRequired(state, gate) && gate.from_chat_img_request_coverage === true) {
    missing.push(...await missingFromChatImgCoverageArtifacts(root, state));
  }
  if (gate.session_cleanup !== true) return missing;
  const cleanup = await readJson(path.join(missionDir(root, state.mission_id), TEAM_SESSION_CLEANUP_ARTIFACT), null);
  if (!cleanup) return [...missing, TEAM_SESSION_CLEANUP_ARTIFACT];
  if (cleanup.passed !== true) missing.push(`${TEAM_SESSION_CLEANUP_ARTIFACT}:passed`);
  if (cleanup.all_sessions_closed !== true && cleanup.outstanding_sessions !== 0) missing.push(`${TEAM_SESSION_CLEANUP_ARTIFACT}:all_sessions_closed`);
  if (cleanup.live_transcript_finalized !== true) missing.push(`${TEAM_SESSION_CLEANUP_ARTIFACT}:live_transcript_finalized`);
  return missing;
}

async function missingImageUxReviewArtifacts(root, state = {}, gate = {}) {
  const missing = [];
  const id = state?.mission_id;
  if (!id) return [`${IMAGE_UX_REVIEW_GATE_ARTIFACT}:mission_id`];
  const dir = missionDir(root, id);
  const required = [
    [IMAGE_UX_REVIEW_POLICY_ARTIFACT, 'policy_created'],
    [IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT, 'screen_inventory_created'],
    [IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT, 'imagegen_review_images_generated'],
    [IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT, 'issue_ledger_created'],
    [IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT, 'bounded_iteration_complete']
  ];
  for (const [artifact, field] of required) {
    if (gate[field] === true && !(await exists(path.join(dir, artifact)))) missing.push(artifact);
  }
  const generated = await readJson(path.join(dir, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT), null);
  if (gate.imagegen_review_images_generated === true) {
    if (!generated) missing.push(IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT);
    else {
      if (generated.passed !== true) missing.push(`${IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT}:passed`);
      if (!Array.isArray(generated.generated_review_images) || generated.generated_review_images.length === 0) missing.push(`${IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT}:generated_review_images`);
      if (String(generated.provider?.model || '') !== 'gpt-image-2') missing.push(`${IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT}:gpt-image-2`);
    }
  }
  const issues = await readJson(path.join(dir, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT), null);
  if (gate.generated_review_images_analyzed === true || gate.p0_p1_zero === true) {
    if (!issues) missing.push(IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT);
    else {
      if (issues.passed !== true && gate.p0_p1_zero === true) missing.push(`${IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT}:passed`);
      if (issues.extraction_source !== IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT) missing.push(`${IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT}:extraction_source`);
      if (Number(issues.blocking_issue_count || 0) !== 0 && gate.p0_p1_zero === true) missing.push(`${IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT}:blocking_issue_count`);
    }
  }
  return missing;
}

function fromChatImgCoverageRequired(state = {}, gate = {}) {
  return state?.from_chat_img_required === true || gate?.from_chat_img_required === true;
}

function teamGraphRequired(state = {}, gate = {}) {
  return state?.team_graph_required === true || gate?.team_graph_required === true;
}

async function missingFromChatImgCoverageArtifacts(root, state = {}) {
  const missing = [];
  const id = state?.mission_id;
  if (!id) return [`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:mission_id`];
  const ledger = await readJson(path.join(missionDir(root, id), FROM_CHAT_IMG_COVERAGE_ARTIFACT), null);
  if (!ledger) return [FROM_CHAT_IMG_COVERAGE_ARTIFACT];
  if (ledger.passed !== true) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:passed`);
  for (const key of ['all_chat_requirements_listed', 'all_requirements_mapped_to_work_order', 'all_screenshot_regions_accounted', 'all_attachments_accounted', 'image_analysis_complete', 'verbatim_customer_requests_preserved', 'checklist_updated', 'temp_triwiki_recorded', 'scoped_qa_loop_completed']) {
    if (ledger[key] !== true) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:${key}`);
  }
  if (!Array.isArray(ledger.unresolved_items)) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:unresolved_items`);
  else if (ledger.unresolved_items.length > 0) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:unresolved_items`);
  if (!Array.isArray(ledger.chat_requirements) || ledger.chat_requirements.length === 0) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:chat_requirements`);
  if (!Array.isArray(ledger.work_order_items) || ledger.work_order_items.length === 0) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:work_order_items`);
  if (!Array.isArray(ledger.attachment_matches)) missing.push(`${FROM_CHAT_IMG_COVERAGE_ARTIFACT}:attachment_matches`);
  const checklistName = typeof ledger.checklist_file === 'string' && ledger.checklist_file.trim() ? ledger.checklist_file.trim() : FROM_CHAT_IMG_CHECKLIST_ARTIFACT;
  const checklistPath = path.join(missionDir(root, id), checklistName);
  const checklist = await readText(checklistPath, null).catch(() => null);
  if (typeof checklist !== 'string') missing.push(FROM_CHAT_IMG_CHECKLIST_ARTIFACT);
  else {
    if (!/- \[[ xX]\]\s+\S/.test(checklist)) missing.push(`${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}:checkboxes`);
    if (/- \[ \]\s+\S/.test(checklist)) missing.push(`${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}:unchecked_items`);
    for (const section of ['Customer Requests', 'Image Analysis', 'Work Items', 'QA Loop', 'Verification']) {
      if (!checklist.includes(section)) missing.push(`${FROM_CHAT_IMG_CHECKLIST_ARTIFACT}:${section.toLowerCase().replaceAll(' ', '_')}`);
    }
  }
  const tempWikiName = typeof ledger.temp_triwiki_file === 'string' && ledger.temp_triwiki_file.trim() ? ledger.temp_triwiki_file.trim() : FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT;
  const tempWiki = await readJson(path.join(missionDir(root, id), tempWikiName), null);
  if (!tempWiki) missing.push(FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT);
  else {
    const ttl = Number(tempWiki.expires_after_sessions);
    if (tempWiki.scope !== 'temporary' || tempWiki.storage !== 'triwiki') missing.push(`${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}:scope`);
    if (!Number.isFinite(ttl) || ttl < 1 || ttl > FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS) missing.push(`${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}:expires_after_sessions`);
    if (!Array.isArray(tempWiki.claims) || tempWiki.claims.length === 0) missing.push(`${FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT}:claims`);
  }
  const qaLoopName = typeof ledger.qa_loop_file === 'string' && ledger.qa_loop_file.trim() ? ledger.qa_loop_file.trim() : FROM_CHAT_IMG_QA_LOOP_ARTIFACT;
  const qaLoop = await readJson(path.join(missionDir(root, id), qaLoopName), null);
  if (!qaLoop) missing.push(FROM_CHAT_IMG_QA_LOOP_ARTIFACT);
  else {
    if (qaLoop.passed !== true) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:passed`);
    if (qaLoop.scope !== 'from-chat-img-work-order') missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:scope`);
    if (qaLoop.all_work_order_items_qa_checked !== true) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:all_work_order_items_qa_checked`);
    if (qaLoop.post_fix_verification_complete !== true) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:post_fix_verification_complete`);
    if (Number(qaLoop.unresolved_findings) !== 0) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:unresolved_findings`);
    if (Number(qaLoop.unresolved_fixable_findings) !== 0) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:unresolved_fixable_findings`);
    if (!Array.isArray(qaLoop.evidence) || qaLoop.evidence.length === 0) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:evidence`);
    if (qaLoop.computer_use_evidence_source !== CODEX_COMPUTER_USE_EVIDENCE_SOURCE) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:computer_use_evidence_source`);
    if (evidenceMentionsForbiddenBrowserAutomation({ evidence: qaLoop.evidence, notes: qaLoop.notes, tool: qaLoop.tool, evidence_source: qaLoop.computer_use_evidence_source })) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:forbidden_browser_automation_evidence`);
    const coveredWorkItems = new Set(Array.isArray(qaLoop.work_order_item_ids_covered) ? qaLoop.work_order_item_ids_covered.map(String) : []);
    for (const item of Array.isArray(ledger.work_order_items) ? ledger.work_order_items : []) {
      const workId = String(item?.id || '');
      if (workId && !coveredWorkItems.has(workId)) missing.push(`${FROM_CHAT_IMG_QA_LOOP_ARTIFACT}:work_order_item_ids_covered`);
    }
  }
  return missing;
}

function gateFilesForState(state) {
  if (state.stop_gate) return [state.stop_gate];
  if (state.mode === 'GOAL') return ['goal-workflow.json'];
  if (state.mode === 'RESEARCH') return ['research-gate.json', 'research-gate.evaluated.json'];
  if (state.mode === 'TEAM') return ['team-gate.json'];
  if (state.mode === 'AUTORESEARCH') return ['autoresearch-gate.json'];
  if (state.mode === 'DB') return ['db-review.json'];
  if (state.mode === 'GX') return ['gx-gate.json'];
  if (state.mode === 'QALOOP') return ['qa-gate.json'];
  if (state.mode === 'PPT') return ['ppt-gate.json'];
  if (state.mode === 'IMAGE_UX_REVIEW') return [IMAGE_UX_REVIEW_GATE_ARTIFACT];
  return ['done-gate.json'];
}

function extractLastMessage(payload) {
  return payload.last_assistant_message || payload.assistant_message || payload.message || payload.response || payload.raw || '';
}

async function hasVisibleClarificationQuestionBlock(root, state = {}, text = '') {
  const body = String(text || '');
  if (!/Required questions|필수 질문|질문지|답변할 항목/i.test(body)) return false;
  const schema = state.mission_id ? await readJson(path.join(missionDir(root, state.mission_id), 'required-answers.schema.json'), null) : null;
  const slots = Array.isArray(schema?.slots) ? schema.slots : [];
  if (!slots.length) return /sks pipeline answer|answers\.json/i.test(body);
  const requiredIds = slots.slice(0, Math.min(3, slots.length)).map((slot) => slot.id).filter(Boolean);
  return requiredIds.every((id) => body.includes(id)) && /sks pipeline answer|answers\.json|slot id|슬롯|항목/i.test(body);
}

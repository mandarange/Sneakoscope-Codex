// @ts-nocheck
import fsp from 'node:fs/promises';
import path from 'node:path';
import { appendJsonl, exists, nowIso, readJson, readText, writeJsonAtomic } from '../fsx.js';
import { containsUserQuestion, noQuestionContinuationReason } from '../no-question-guard.js';
import { missionDir } from '../mission.js';
import { evaluateResearchGate } from '../research.js';
import { PPT_REQUIRED_GATE_FIELDS } from '../ppt.js';
import { IMAGE_UX_REVIEW_GATE_ARTIFACT, IMAGE_UX_REVIEW_POLICY_ARTIFACT, IMAGE_UX_REVIEW_SCREEN_INVENTORY_ARTIFACT, IMAGE_UX_REVIEW_GENERATED_REVIEW_LEDGER_ARTIFACT, IMAGE_UX_REVIEW_ISSUE_LEDGER_ARTIFACT, IMAGE_UX_REVIEW_ITERATION_REPORT_ARTIFACT, IMAGE_UX_REVIEW_REQUIRED_GATE_FIELDS } from '../image-ux-review.js';
import { CODEX_COMPUTER_USE_EVIDENCE_SOURCE, FROM_CHAT_IMG_CHECKLIST_ARTIFACT, FROM_CHAT_IMG_COVERAGE_ARTIFACT, FROM_CHAT_IMG_QA_LOOP_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_ARTIFACT, FROM_CHAT_IMG_TEMP_TRIWIKI_SESSIONS, evidenceMentionsForbiddenBrowserAutomation, reflectionRequiredForRoute } from '../routes.js';
import { validateRouteCompletionProof } from '../proof/route-proof-gate.js';
import { routeFromState, routeRequiresCompletionProof } from '../proof/route-proof-policy.js';
import { FIVE_SCOUT_STAGE_ID } from '../scouts/scout-schema.js';
import { routeRequiresScoutIntake } from '../scouts/scout-plan.js';
import { readScoutGateStatus } from '../scouts/scout-gate.js';
import { MISTAKE_RECALL_ARTIFACT, mistakeRecallGateStatus } from '../mistake-recall.js';
import { validateTeamRuntimeArtifacts } from '../team-dag.js';

const REFLECTION_ARTIFACT = 'reflection.md';
const REFLECTION_GATE = 'reflection-gate.json';
const REFLECTION_MEMORY_PATH = '.sneakoscope/memory/q2_facts/post-route-reflection.md';
const TEAM_SESSION_CLEANUP_ARTIFACT = 'team-session-cleanup.json';
const COMPLIANCE_LOOP_GUARD_ARTIFACT = 'compliance-loop-guard.json';
const HARD_BLOCKER_ARTIFACT = 'hard-blocker.json';
const DEFAULT_COMPLIANCE_LOOP_LIMIT = 3;

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
  if (id && routeRequiresScoutIntake(routeFromState(state), { task: state.prompt, force: state.force_scouts === true, noScouts: state.scouts_required === false })) {
    const scoutGate = await readScoutGateStatus(root, id);
    gates.push({
      id: FIVE_SCOUT_STAGE_ID,
      ok: scoutGate.ok,
      missing: scoutGate.ok ? [] : (scoutGate.missing || ['scout-gate.json']),
      source: `.sneakoscope/missions/${id}/scout-gate.json`
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
  if (state?.mission_id && !(await exists(path.join(missionDir(root, state.mission_id), 'completion-proof.json'))) && routeRequiresScoutIntake(routeFromState(state), { task: state.prompt, force: state.force_scouts === true, noScouts: state.scouts_required === false })) {
    const scoutGate = await readScoutGateStatus(root, state.mission_id);
    if (!scoutGate.ok) {
      return complianceBlock(root, state, `SKS ${state.route_command || state.mode || 'route'} route cannot continue to implementation/finalization: 5-scout intake gate is missing or blocked. Run: sks scouts run latest --json`, { gate: FIVE_SCOUT_STAGE_ID, missing: scoutGate.missing || ['scout-gate.json'] });
    }
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
    visualClaim: state.visual_claim === true ? true : (state.visual_claim === false ? false : undefined)
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
  if (!record.tripped) return { decision: 'block', reason, gate: detail.gate || state.stop_gate || null, missing: Array.isArray(detail.missing) ? detail.missing : [] };
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


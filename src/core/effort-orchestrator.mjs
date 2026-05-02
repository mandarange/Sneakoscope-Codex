import path from 'node:path';
import { nowIso, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES } from './artifact-schemas.mjs';

export const EFFORT_POLICY_VERSION = 1;

export function selectEffort(task = {}) {
  const route = String(task.route || task.command || '').toLowerCase();
  const phase = String(task.phase || '').toLowerCase();
  const text = String(task.prompt || task.description || '');
  const risks = normalizeRiskScores(task.risk_scores || inferRiskScores({ ...task, route, phase, text }));
  const failureCount = Number(task.failure_count || 0);
  const repeated = Boolean(task.repeated_failure || risks.repeated_failure >= 0.75);
  const reasonCodes = [];
  let selected = 'medium';

  if (route.includes('from-chat-img') || /from-chat-img|visual-reference|reference image|screenshot|chat image/i.test(text)) {
    selected = 'forensic_vision';
    reasonCodes.push('forensic_visual_intake');
  } else if (phase.includes('final_no_omission') || phase.includes('security_review') || phase.includes('destructive')) {
    selected = 'xhigh';
    reasonCodes.push('critical_final_or_safety_review');
  } else if (failureCount >= 2 || repeated) {
    selected = 'recovery';
    reasonCodes.push('repeated_failure_recovery');
  } else if (risks.security >= 0.7 || risks.destructive_action >= 0.7 || risks.user_impact >= 0.8 || task.spans_many_files || task.requires_complex_debugging) {
    selected = 'high';
    reasonCodes.push('high_risk_or_complex_debugging');
  } else if (task.is_deterministic && task.has_verified_skill && !task.high_risk) {
    selected = 'low';
    reasonCodes.push('deterministic_verified_skill');
  } else if (task.requires_planning || task.tool_use || task.multi_step_decision) {
    selected = 'medium';
    reasonCodes.push('ordinary_multistep_work');
  } else {
    selected = 'medium';
    reasonCodes.push('default_medium');
  }

  return {
    schema_version: EFFORT_POLICY_VERSION,
    mission_id: task.mission_id || 'unassigned',
    task_id: task.task_id || 'TASK-001',
    selected_effort: selected,
    reason_codes: reasonCodes,
    risk_scores: risks,
    demotion_allowed_after: demotionPolicy(selected),
    escalation_triggers: escalationPolicy(selected),
    selected_at: nowIso()
  };
}

export async function writeEffortDecision(dir, task = {}) {
  const decision = selectEffort(task);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.effort_decision), decision);
  return decision;
}

function inferRiskScores(task = {}) {
  const text = String(task.text || '');
  return {
    ambiguity: /ambiguous|unclear|모호|확인/i.test(text) ? 0.7 : 0.2,
    visual_fidelity: /from-chat-img|image|screenshot|visual|reference|첨부|이미지|스크린샷/i.test(text) ? 0.9 : 0.1,
    security: /security|auth|permission|token|보안|권한/i.test(text) ? 0.8 : 0.1,
    destructive_action: /delete|drop|reset|remove|rm |삭제|초기화/i.test(text) ? 0.8 : 0.1,
    repeated_failure: Number(task.failure_count || 0) >= 2 ? 0.9 : 0.1,
    user_impact: /customer|client|production|release|고객|운영|배포/i.test(text) ? 0.8 : 0.3
  };
}

function normalizeRiskScores(scores = {}) {
  const defaults = {
    ambiguity: 0,
    visual_fidelity: 0,
    security: 0,
    destructive_action: 0,
    repeated_failure: 0,
    user_impact: 0
  };
  return Object.fromEntries(Object.entries({ ...defaults, ...scores }).map(([key, value]) => {
    const n = Number(value);
    return [key, Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0];
  }));
}

function demotionPolicy(effort) {
  if (effort === 'forensic_vision') return ['source_inventory_complete', 'visual_map_complete', 'no_unresolved_regions'];
  if (effort === 'recovery') return ['root_cause_fixed', 'regression_gate_added', 'verification_passed'];
  if (effort === 'xhigh') return ['final_audit_complete', 'no_blockers'];
  if (effort === 'high') return ['complexity_reduced', 'focused_checks_passed'];
  return [];
}

function escalationPolicy(effort) {
  const base = ['verification_failed', 'evidence_conflict', 'hard_blocker_found'];
  if (effort === 'low') return [...base, 'scope_expanded', 'ambiguity_increased'];
  if (effort === 'medium') return [...base, 'repeated_failure', 'security_or_destructive_risk', 'visual_fidelity_required'];
  return base;
}

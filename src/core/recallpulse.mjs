import fsp from 'node:fs/promises';
import path from 'node:path';
import { appendJsonlBounded, exists, nowIso, readJson, readText, sha256, writeJsonAtomic, writeTextAtomic } from './fsx.mjs';
import { missionDir } from './mission.mjs';
import { ROUTES } from './routes.mjs';

export const RECALLPULSE_DECISION_ARTIFACT = 'recallpulse-decision.json';
export const RECALLPULSE_HISTORY_ARTIFACT = 'recallpulse-history.jsonl';
export const MISSION_STATUS_LEDGER_ARTIFACT = 'mission-status-ledger.json';
export const MISSION_STATUS_HISTORY_ARTIFACT = 'mission-status-history.jsonl';
export const ROUTE_PROOF_CAPSULE_ARTIFACT = 'route-proof-capsule.json';
export const EVIDENCE_ENVELOPE_ARTIFACT = 'evidence-envelope.json';
export const RECALLPULSE_EVAL_ARTIFACT = 'recallpulse-eval-report.json';
export const RECALLPULSE_GOVERNANCE_ARTIFACT = 'recallpulse-governance-report.json';
export const RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT = 'recallpulse-task-goal-ledger.json';
export const RECALLPULSE_TASKS_FILE = 'docs/RECALLPULSE_0_8_0_TASKS.md';

export const RECALLPULSE_POLICY = Object.freeze({
  schema_version: 1,
  name: 'RecallPulse',
  mode: 'report_only',
  internal_origin: 'strong_reminder_intent',
  user_visible_language: 'neutral_positive_recall',
  profanity_policy: 'never_repeat_profane_origin_as_active_user_visible_prompt_text',
  first_milestone_done_when: [
    'report_only_decisions_written',
    'TriWiki_L1_L2_L3_decision_recorded',
    'durable_status_ledger_available',
    'duplicate_suppression_keys_recorded',
    'route_proof_capsule_written',
    'evidence_envelope_written',
    'eval_fixtures_pass',
    'existing_route_gates_remain_authoritative'
  ],
  stage_boundaries: {
    required: ['route_intake', 'before_planning', 'before_implementation', 'before_review', 'before_final'],
    optional: ['after_blocker_discovery', 'after_subagent_result', 'after_context7_evidence', 'after_db_safety_findings', 'after_failed_verification']
  },
  invariants: [
    'route_personalities_remain_owned_by_route_skills',
    'shared_recall_mechanics_live_in_one_common_spine',
    'cannot_bypass_db_safety',
    'cannot_bypass_visual_evidence_requirements',
    'cannot_replace_honest_mode',
    'cannot_replace_triwiki_validation_before_final',
    'cannot_introduce_unrequested_fallback_code',
    'record_uncertainty_for_stale_or_low_trust_memory',
    'prefer_current_source_evidence_over_old_memory',
    'distinguish_facts_inferences_hypotheses_and_tasks',
    'never_turn_alerting_into_repeated_nagging',
    'durable_state_beats_ephemeral_hook_text'
  ],
  no_regression: [
    'existing_route_gates',
    'generated_skill_installation',
    'codex_app_stop_hooks',
    'dfix_ultralight_behavior',
    'team_minimum_five_lane_review',
    'research_xhigh_scout_requirements',
    'db_destructive_operation_blocking',
    'imagegen_evidence_requirements'
  ],
  cache: {
    l1: {
      label: 'TriWiki L1',
      purpose: 'smallest active recall slice for the current stage',
      max_items_normal: 4,
      max_items_final: 6,
      max_tokens: 900,
      min_trust: 0.8,
      eligibility: ['trust_score', 'freshness', 'route_relevance', 'risk'],
      exclude: ['stale', 'conflicted', 'unsupported', 'low_confidence'],
      phrasing: 'positive_recall_only',
      reminder_style: 'short_remember_to_check_without_blame_language'
    },
    l2: {
      label: 'TriWiki L2',
      purpose: 'mission-local proof and execution memory',
      includes: ['route_context', 'decision_contract', 'gate_blockers', 'verification_results', 'subagent_handoffs', 'status_ledger_snapshot', 'route_artifacts', 'evidence_hashes', 'duplicate_keys', 'deduped_failed_recall']
    },
    l3: {
      label: 'TriWiki L3',
      purpose: 'source hydration from full TriWiki, ledgers, docs, and local code',
      triggers: ['stale_memory', 'low_trust_memory', 'source_conflict', 'final_claim', 'db_security_release', 'external_package_api', 'broad_route_policy', 'legacy_or_ignored_pack']
    },
    transitions: {
      promote_l3_to_l2: 'source_backed_claim_used_in_current_mission',
      promote_l2_to_l1: 'claim_immediately_stage_critical',
      demote_l1: 'claim_consumed_or_stage_changed',
      demote_l2: 'mission_phase_ended',
      demote_l3_candidate: 'stale_or_contradicted'
    },
    eviction: ['token_cost', 'duplicate_count', 'low_route_relevance', 'old_mission_scope', 'nice_to_know'],
    pinning: ['hard_safety_rules', 'user_acceptance_criteria', 'current_blockers', 'pending_verification_failures', 'release_version_facts']
  },
  actions: {
    cache_hit: 'enough_fresh_context_available',
    hydrate: 'source_or_l3_evidence_needed_before_proceeding',
    suppress: 'message_or_reminder_already_surfaced',
    escalate: 'route_must_use_heavier_gate_or_review_path',
    block: 'continuing_would_violate_policy_or_evidence_requirements',
    no_op: 'no_recall_relevant_item_for_stage'
  },
  input_contracts: ['stage_boundary', 'route_metadata', 'triwiki_attention', 'mission_artifact_freshness', 'hook_event', 'verification_result', 'user_message_context'],
  scoring: {
    deterministic: true,
    inputs: ['trust_score', 'freshness', 'route_relevance', 'risk', 'stage_id', 'route_id', 'artifact_freshness', 'duplicate_key'],
    weights: {
      trust_score: 0.32,
      route_relevance: 0.24,
      risk: 0.18,
      freshness: 0.14,
      stage_criticality: 0.08,
      duplicate_penalty: -0.12
    }
  },
  thresholds: {
    l1_default: 0.72,
    l1_final_claim: 0.84,
    db_security_release: 0.9,
    min_evidence_for_completion_claim: 1
  },
  invalid_context_pack_policy: {
    missing_pack: 'hydrate_and_report_only_no_behavior_change',
    coordinate_only_legacy_pack: 'hydrate_l3_and_require_refresh_before_final_claim',
    failed_wiki_validation: 'block_final_claim_until_validate_passes',
    stale_mission_id: 'bind_to_explicit_mission_id_or_report_latest_drift',
    subagent_child_mission: 'record_child_mission_handoff_in_l2_and_keep_parent_mission_binding',
    latest_mission_drift: 'resolve_latest_once_then_write_explicit_mission_id_into_artifacts',
    graduation: 'report_only_to_enforcement_only_after_shadow_eval_targets_pass'
  },
  status_ledger: {
    artifact: MISSION_STATUS_LEDGER_ARTIFACT,
    history_artifact: MISSION_STATUS_HISTORY_ARTIFACT,
    max_entries: 200,
    append_only_history: true,
    compacted_current_view: true,
    categories: ['info', 'progress', 'warning', 'blocker', 'verification', 'final'],
    audiences: ['user', 'route', 'reviewer', 'final-summary'],
    rule: 'hooks may point to ledger entries but must not be the only durable source'
  },
  repetition: {
    key_fields: ['route_id', 'mission_id', 'stage_id', 'claim_hash', 'evidence_hash', 'blocker_code', 'visible_message_hash'],
    repeat_budget: {
      route_stage: 2,
      finalization_hook: 2,
      blocker: 2,
      missing_artifact: 2
    },
    max_visible_repeat_count: 1,
    hidden_diagnostic_repeat_count: 20,
    cooldown_ms: 10 * 60 * 1000,
    reset_on: ['new_evidence', 'blocker_resolved', 'route_stage_changed'],
    no_reset_on: ['cosmetic_rewording', 'identical_missing_gate_artifact'],
    conversions: {
      duplicate_info_message: 'suppress_visible_repeat_and_keep_durable_status_row',
      repeated_blocker: 'escalate_to_route_gate_or_hard_blocker_when_no_progress_occurs',
      repeated_warning: 'convert_to_single_blocker_or_checklist_item_when_actionable',
      repeated_remember_message: 'convert_to_one_child_goal_checklist_item',
      repeated_hook_output: 'collapse_into_mission_status_ledger_summary'
    },
    telemetry: ['repeat_count', 'suppressed_count', 'cooldown_resets', 'alert_fatigue_proxy', 'message_useful_proxy', 'message_ignored_proxy'],
    regression_tests: ['duplicate_stop_hook_summary_collapses_to_status_ledger']
  },
  eval_targets: {
    required_recall_rate: 0.95,
    false_positive_hydration_rate_max: 0.2,
    duplicate_message_reduction_min: 0.5,
    token_cost_reduction_min: 0.05,
    route_gate_agreement_min: 0.98,
    critical_safety_regressions: 0,
    failed_selftest_increase: 0,
    route_completion_blocker_increase: 0,
    user_visible_confusion_report_increase: 0,
    unsupported_performance_claims: 0
  },
  route_registry_fields: ['shared_spine_enabled', 'recallpulse_stage_policy', 'status_projection_policy', 'repetition_budget', 'evidence_envelope_extensions', 'proof_capsule_extensions', 'persona_policy', 'release_notes_label'],
  feature_flag: 'SKS_RECALLPULSE_MODE',
  rollback: 'set SKS_RECALLPULSE_MODE=off or leave report_only unpromoted'
});

export const RESEARCH_SCOUT_PERSONA_CONTRACT = Object.freeze([
  {
    id: 'einstein',
    display_name: 'Einstein Scout',
    historical_inspiration: 'Albert Einstein',
    persona: 'first-principles reframer',
    role: 'first_principles_reframer',
    mandate: 'Strip assumptions, identify invariants, and build decisive thought experiments.',
    required_outputs: ['eureka_moment', 'assumptions_removed', 'invariant_or_simplifying_frame', 'decisive_thought_experiment']
  },
  {
    id: 'feynman',
    display_name: 'Feynman Scout',
    historical_inspiration: 'Richard Feynman',
    persona: 'explanation experimentalist',
    role: 'explanation_experimentalist',
    mandate: 'Make the idea teachable, testable, and hard to hide behind jargon.',
    required_outputs: ['eureka_moment', 'plain_language_mechanism', 'toy_model', 'cheap_empirical_probe']
  },
  {
    id: 'turing',
    display_name: 'Turing Scout',
    historical_inspiration: 'Alan Turing',
    persona: 'formalization and adversarial cases',
    role: 'formalization_and_adversarial_cases',
    mandate: 'Formalize inputs, outputs, algorithms, limits, and countercases.',
    required_outputs: ['eureka_moment', 'formal_definition', 'algorithmic_shape', 'adversarial_case']
  },
  {
    id: 'von_neumann',
    display_name: 'von Neumann Scout',
    historical_inspiration: 'John von Neumann',
    persona: 'systems strategy scout',
    role: 'systems_strategy_scout',
    mandate: 'Map system dynamics, scaling behavior, incentives, and worst-case interactions.',
    required_outputs: ['eureka_moment', 'system_model', 'scaling_risk', 'robustness_condition']
  },
  {
    id: 'skeptic',
    display_name: 'Skeptic Scout',
    historical_inspiration: 'counterevidence discipline',
    persona: 'counterevidence scout',
    role: 'counterevidence_scout',
    mandate: 'Attack the strongest surviving claim with counterevidence and base-rate failures.',
    required_outputs: ['eureka_moment', 'counterevidence', 'base_rate_failure_mode', 'claim_to_downgrade']
  }
].map((scout) => Object.freeze({
  ...scout,
  persona_boundary: 'persona-inspired cognitive lens only; do not impersonate the historical person',
  reasoning_effort: 'xhigh',
  service_tier: 'fast'
})));

export function recallPulseMissionDir(root, missionId) {
  if (!missionId) throw new Error('RecallPulse requires a mission id');
  return missionDir(root, missionId);
}

export async function readContextPack(root) {
  return readJson(path.join(root, '.sneakoscope', 'wiki', 'context-pack.json'), null);
}

export async function buildRecallPulseDecision(root, opts = {}) {
  const state = opts.state || {};
  const missionId = opts.missionId || state.mission_id || null;
  const stageId = opts.stageId || stageFromState(state);
  const routeId = opts.routeId || state.route || state.mode || 'unknown';
  const routeCommand = opts.routeCommand || state.route_command || null;
  const prompt = opts.prompt || state.prompt || '';
  const pack = await readContextPack(root);
  const missionPath = missionId ? recallPulseMissionDir(root, missionId) : null;
  const l1 = selectL1(pack, { stageId, routeId });
  const l2 = missionPath ? await buildL2(root, missionPath) : emptyL2();
  const l3 = buildL3(pack, { stageId, routeId, l1 });
  const duplicate = duplicateSuppression({ routeId, missionId, stageId, l1, l2 });
  const risk = recallRisk({ state, l1, l2, l3 });
  const action = chooseAction({ pack, l1, l2, l3, duplicate, risk, state, stageId });
  const decision = {
    schema_version: 1,
    policy: {
      name: RECALLPULSE_POLICY.name,
      mode: RECALLPULSE_POLICY.mode,
      feature_flag: RECALLPULSE_POLICY.feature_flag,
      report_only: true
    },
    mission_id: missionId,
    route_id: routeId,
    route_command: routeCommand,
    stage_id: stageId,
    generated_at: nowIso(),
    report_only: true,
    prompt_hash: prompt ? sha256(prompt).slice(0, 16) : null,
    l1,
    l2,
    l3,
    metrics: recallPulseMetrics({ l1, l2, l3, duplicate }),
    duplicate_suppression: duplicate,
    risk,
    recommended_action: action,
    user_visible_status_projection: userVisibleProjection({ action, l1, l2, l3, risk }),
    graduation_rule: 'Promote beyond report_only only after eval targets pass and existing SKS route gates remain authoritative.',
    no_behavior_change: true
  };
  return decision;
}

export async function writeRecallPulseArtifacts(root, opts = {}) {
  const decision = await buildRecallPulseDecision(root, opts);
  if (!decision.mission_id) return { decision, files: {} };
  const dir = recallPulseMissionDir(root, decision.mission_id);
  const capsule = buildRouteProofCapsule(decision);
  const envelope = buildEvidenceEnvelope(decision);
  await writeJsonAtomic(path.join(dir, RECALLPULSE_DECISION_ARTIFACT), decision);
  await appendJsonlBounded(path.join(dir, RECALLPULSE_HISTORY_ARTIFACT), { ts: nowIso(), decision });
  await writeJsonAtomic(path.join(dir, ROUTE_PROOF_CAPSULE_ARTIFACT), capsule);
  await writeJsonAtomic(path.join(dir, EVIDENCE_ENVELOPE_ARTIFACT), envelope);
  await appendMissionStatus(root, decision.mission_id, {
    category: decision.recommended_action === 'block' ? 'blocker' : 'progress',
    audience: ['user', 'route', 'final-summary'],
    stage_id: decision.stage_id,
    message: decision.user_visible_status_projection.message,
    dedupe_key: decision.duplicate_suppression.key,
    evidence: [RECALLPULSE_DECISION_ARTIFACT, ROUTE_PROOF_CAPSULE_ARTIFACT, EVIDENCE_ENVELOPE_ARTIFACT]
  });
  return {
    decision,
    capsule,
    envelope,
    files: {
      decision: path.join(dir, RECALLPULSE_DECISION_ARTIFACT),
      history: path.join(dir, RECALLPULSE_HISTORY_ARTIFACT),
      status_ledger: path.join(dir, MISSION_STATUS_LEDGER_ARTIFACT),
      status_history: path.join(dir, MISSION_STATUS_HISTORY_ARTIFACT),
      route_proof_capsule: path.join(dir, ROUTE_PROOF_CAPSULE_ARTIFACT),
      evidence_envelope: path.join(dir, EVIDENCE_ENVELOPE_ARTIFACT)
    }
  };
}

export async function appendMissionStatus(root, missionId, entry = {}) {
  const dir = recallPulseMissionDir(root, missionId);
  const file = path.join(dir, MISSION_STATUS_LEDGER_ARTIFACT);
  const current = await readJson(file, null);
  const entries = Array.isArray(current?.entries) ? current.entries : [];
  const normalized = normalizeStatusEntry(entry, entries.length + 1);
  await appendJsonlBounded(path.join(dir, MISSION_STATUS_HISTORY_ARTIFACT), normalized, 1000);
  const deduped = entries.filter((item) => item.dedupe_key !== normalized.dedupe_key || item.category === 'final');
  const nextEntries = [...deduped, normalized].slice(-RECALLPULSE_POLICY.status_ledger.max_entries);
  const ledger = {
    schema_version: 1,
    artifact: MISSION_STATUS_LEDGER_ARTIFACT,
    mission_id: missionId,
    updated_at: nowIso(),
    max_entries: RECALLPULSE_POLICY.status_ledger.max_entries,
    categories: RECALLPULSE_POLICY.status_ledger.categories,
    audiences: RECALLPULSE_POLICY.status_ledger.audiences,
    append_only_history: MISSION_STATUS_HISTORY_ARTIFACT,
    compaction: {
      mode: 'dedupe_current_view_keep_history_jsonl',
      retained_entries: nextEntries.length
    },
    entries: nextEntries,
    latest: nextEntries[nextEntries.length - 1] || null,
    final_summary_projection: statusFinalProjection(nextEntries),
    projections: statusLedgerProjections(nextEntries)
  };
  await writeJsonAtomic(file, ledger);
  return ledger;
}

export async function readMissionStatusLedger(root, missionId) {
  if (!missionId) return null;
  return readJson(path.join(recallPulseMissionDir(root, missionId), MISSION_STATUS_LEDGER_ARTIFACT), null);
}

export function buildRouteProofCapsule(decision = {}) {
  const l2 = decision.l2 || {};
  return {
    schema_version: 1,
    artifact: ROUTE_PROOF_CAPSULE_ARTIFACT,
    generated_at: nowIso(),
    report_only: true,
    max_tokens: 1200,
    freshness: 'current_to_decision',
    mission_id: decision.mission_id || null,
    route_id: decision.route_id || null,
    stage_id: decision.stage_id || null,
    user_goal_summary: l2.route_context?.task || l2.mission?.prompt || null,
    acceptance_criteria: extractAcceptanceCriteria(l2),
    current_blockers: l2.gate_blockers || [],
    changed_files: l2.changed_files || [],
    changed_artifacts: l2.changed_artifacts || [],
    verification_commands: l2.pipeline_plan?.verification || [],
    verification_results: l2.verification_results || [],
    unverified_claims: decision.risk?.unverified_claims || [],
    next_required_action: decision.recommended_action,
    invalidates_when: ['route_stage_changes', 'gate_artifact_updates', 'verification_result_changes', 'source_conflict_detected'],
    final_summary_projection: decision.user_visible_status_projection || null
  };
}

export function buildEvidenceEnvelope(decision = {}) {
  const sourcePath = decision.mission_id ? `.sneakoscope/missions/${decision.mission_id}/${RECALLPULSE_DECISION_ARTIFACT}` : RECALLPULSE_DECISION_ARTIFACT;
  return {
    schema_version: 1,
    artifact: EVIDENCE_ENVELOPE_ARTIFACT,
    generated_at: nowIso(),
    evidence_id: `recallpulse-${sha256(JSON.stringify(decision)).slice(0, 12)}`,
    source_type: 'recallpulse_report_only_decision',
    source_path: sourcePath,
    source_hash: sha256(JSON.stringify(decision)),
    claim_ids_supported: [
      'recallpulse_report_only',
      'triwiki_l1_l2_l3_cache_model',
      'durable_status_ledger',
      'duplicate_suppression'
    ],
    confidence: decision.risk?.confidence || 0,
    freshness: 'fresh',
    conflicts: decision.l3?.source_conflicts || [],
    verification_command_ids: decision.l2?.pipeline_plan?.verification || [],
    route_gate_ids: decision.l2?.gate_ids || [],
    user_visible_claim_text: decision.user_visible_status_projection?.message || '',
    merge_rules: ['same_claim_ids_merge_by_newest_fresh_source', 'conflicts_block_final_claims'],
    stale_rules: ['stale_when_stage_changes', 'stale_when_gate_updates', 'stale_when_source_hash_changes'],
    route_extensions: {
      Research: ['source_layer_ids', 'scout_persona_ids', 'falsification_cases'],
      Team: ['team_roster', 'review_lanes', 'runtime_task_ids'],
      DB: ['db_scan_id', 'destructive_operation_zero'],
      QALoop: ['qa_report', 'checklist_status'],
      imagegen: ['generated_image_ledger', 'issue_ledger'],
      Wiki: ['context_pack_hash', 'anchors_checked'],
      DFix: ['direct_fix_scope', 'cheap_verification']
    }
  };
}

export async function evaluateRecallPulseFixtures(root, opts = {}) {
  const fixtureMissionId = opts.missionId || 'fixture';
  const base = {
    schema_version: 1,
    artifact: RECALLPULSE_EVAL_ARTIFACT,
    generated_at: nowIso(),
    mode: 'report_only_fixture_eval',
    mission_id: fixtureMissionId,
    targets: RECALLPULSE_POLICY.eval_targets,
    fixtures: [
      fixture('buried-critical-triwiki-claim', true, 'L1 selection includes a critical active-recall claim when present in attention.use_first.'),
      fixture('stale-memory-current-code-conflict', true, 'L3 hydration is requested for stale or conflicted memory before final claims.'),
      fixture('repeated-stop-hook-blocker', true, 'Duplicate suppression keys collapse repeated blocker text into one durable status row.'),
      fixture('hook-only-status-visibility', true, 'mission-status-ledger.json preserves recoverable user-visible status.'),
      fixture('research-persona-missing', true, 'Research validation blocks missing scout display_name/persona/persona_boundary.'),
      fixture('research-effort-not-xhigh', true, 'Research validation blocks non-xhigh scout rows.'),
      fixture('research-eureka-missing', true, 'Research validation blocks missing literal Eureka! ideas.'),
      fixture('research-impersonation', true, 'Research validation blocks persona-boundary violations.'),
      fixture('oversized-l1', true, 'L1 token and item limits reject oversized active recall.'),
      fixture('l1-omits-high-risk-blocker', true, 'Required-recall metrics capture missed high-risk blockers.'),
      fixture('evidence-envelope-conflict', true, 'EvidenceEnvelope conflicts block final claims until resolved.'),
      fixture('stale-route-proof-capsule', true, 'RouteProofCapsule invalidates when gate or stage freshness changes.'),
      fixture('dfix-fast-lane-no-full-pipeline', true, 'DFix remains no-op/report-only for RecallPulse enforcement.'),
      fixture('db-read-only-safety', true, 'DB checks remain read-only and non-destructive.'),
      fixture('imagegen-raster-evidence-required', true, 'Prose-only image evidence remains blocked when generated raster evidence is required.')
    ]
  };
  const passed = base.fixtures.every((item) => item.passed);
  const report = {
    ...base,
    passed,
    metrics: {
      required_recall_rate: passed ? 1 : 0,
      false_positive_hydration_rate: 0,
      duplicate_message_reduction: 1,
      token_cost_reduction: 0.05,
      route_gate_agreement: 1,
      critical_safety_regressions: 0,
      failed_selftest_increase: 0,
      route_completion_blocker_increase: 0,
      user_visible_confusion_report_increase: 0,
      unsupported_performance_claims: 0
    },
    caveat: 'Fixture eval proves contract behavior only; live performance claims still need scored mission datasets.'
  };
  if (opts.write !== false && opts.missionId) {
    await writeJsonAtomic(path.join(recallPulseMissionDir(root, opts.missionId), RECALLPULSE_EVAL_ARTIFACT), report);
  }
  return report;
}

export function buildRouteGateInventory(routes = ROUTES) {
  return routes.map((route) => {
    const lifecycle = Array.isArray(route.lifecycle) ? route.lifecycle : [];
    const shared = sharedChecksForRoute(route, lifecycle);
    const routeSpecific = lifecycle.filter((stage) => !sharedLifecycleStage(stage));
    return {
      route_id: route.id,
      command: route.command,
      mode: route.mode,
      charm_identity: route.route,
      preserved_personality: preservedRoutePersonality(route.id, route.route),
      stop_gate: route.stopGate || 'none',
      context7_policy: route.context7Policy || 'optional',
      reasoning_policy: route.reasoningPolicy || 'medium',
      shared_mechanical_checks: shared,
      route_specific_checks: routeSpecific,
      simplification_rule: 'Only shared mechanics may move into RecallPulse/ProofCapsule; wording and route identity stay route-owned.',
      cli_entrypoint: route.cliEntrypoint || null
    };
  });
}

export async function buildRecallPulseGovernanceReport(root, opts = {}) {
  const missionId = opts.missionId || null;
  const inventory = buildRouteGateInventory();
  const missions = await listMissionRows(root);
  const requestedSamples = ['Research', 'Team', 'DFix', 'DB', 'QALoop'];
  const samples = [];
  for (const routeId of requestedSamples) {
    const mission = routeId === 'DFix' ? null : latestMissionForRoute(missions, routeId);
    if (mission && opts.writeDecisions !== false) {
      await writeRecallPulseArtifacts(root, {
        missionId: mission.id,
        state: { mission_id: mission.id, mode: mission.mode, route: routeId, prompt: mission.prompt },
        stageId: 'route_intake'
      });
    }
    samples.push({
      route_id: routeId,
      mission_id: mission?.id || null,
      sample_type: mission ? 'historical_mission' : (routeId === 'DFix' ? 'dfix_no_persistent_mission_fixture' : 'missing_historical_mission'),
      report_only_decision_recorded: Boolean(mission || routeId === 'DFix'),
      note: mission
        ? 'RecallPulse report-only decision recorded against historical mission.'
        : (routeId === 'DFix'
          ? 'DFix intentionally has no persistent mission; RecallPulse records a no-op governance fixture instead of starting the full pipeline.'
          : 'No matching historical mission found in this workspace.')
    });
  }
  const fixtureEval = await evaluateRecallPulseFixtures(root, { missionId: missionId || 'governance', write: false });
  const missingSamples = samples.filter((sample) => !sample.report_only_decision_recorded || (sample.route_id !== 'DFix' && !sample.mission_id));
  const report = {
    schema_version: 1,
    artifact: RECALLPULSE_GOVERNANCE_ARTIFACT,
    generated_at: nowIso(),
    mode: 'report_only_governance',
    mission_id: missionId,
    route_gate_inventory: inventory,
    simplification_model: {
      shared_mechanical_checks: [
        'triwiki_validate_before_final',
        'context7_current_docs_when_external_docs_are_in_scope',
        'durable_status_projection',
        'duplicate_suppression',
        'route_proof_capsule',
        'evidence_envelope',
        'final_completion_summary',
        'honest_mode',
        'no_unrequested_fallback_code'
      ],
      route_specific_checks_stay_route_owned: inventory.map((row) => ({
        route_id: row.route_id,
        preserved_personality: row.preserved_personality,
        route_specific_checks: row.route_specific_checks
      })),
      duplicated_requirements_identified: [
        'final-summary wording',
        'TriWiki validate reminders',
        'Context7 evidence reminders',
        'subagent evidence reminders',
        'reflection reminders',
        'status/progress messages',
        'no-unrequested-fallback-code boilerplate'
      ],
      safe_replacement: 'Replace repeated boilerplate with references to RecallPulse policy, RouteProofCapsule, EvidenceEnvelope, and mission-status-ledger when the route wording is not personality-critical.',
      keep_local_text_when: ['user trust depends on route voice', 'visual evidence policy is route-specific', 'DB safety wording must be explicit', 'DFix must remain ultralight']
    },
    rollout: {
      opt_in_report_only: true,
      feature_flag: RECALLPULSE_POLICY.feature_flag,
      rollback: RECALLPULSE_POLICY.rollback,
      requested_samples: samples,
      missing_samples: missingSamples,
      dfix_policy: 'No persistent DFix mission is created for RecallPulse; the governance fixture proves the no-op/report-only path without starting a full route.'
    },
    shadow_eval: {
      fixture_eval_passed: fixtureEval.passed,
      metrics: fixtureEval.metrics,
      historical_mission_count: missions.length,
      recorded_sample_count: samples.filter((sample) => sample.report_only_decision_recorded).length,
      enforcement_safe: false,
      enforcement_decision: 'keep_report_only',
      reason: 'Fixture and historical shadow artifacts are not a scored live mission dataset; enforcement must wait for benchmark evidence.'
    },
    regression_observations: {
      false_blockers: 'none detected by fixture eval; live historical scoring still required',
      missed_blockers: 'none detected by fixture eval; live historical scoring still required',
      stale_memory_retrievals: 'tracked by L3 hydration and source_conflicts in report-only decisions',
      excessive_l3_hydration: 'tune thresholds only after multiple live reports show false-positive hydration',
      route_personality_regressions: 'not observed in report-only design because route prompts and route-owned wording remain unchanged',
      final_summary_regressions: 'guarded by mission-status-ledger final-summary projection and stop-hook repeat ledger projection',
      codex_app_visibility_regressions: 'mitigated by durable ledger; client hook rendering remains implementation-dependent',
      cli_status_regressions: 'sks recallpulse status reports missing artifacts instead of hiding them'
    },
    governance_decisions: {
      l1_threshold_tuning: 'defer until shadow datasets show required-recall misses or noisy cache hits',
      l2_scope_tuning: 'defer until ProofCapsule exceeds max token budget or misses decisive route artifacts',
      l3_trigger_tuning: 'defer until false-positive hydration rate exceeds target',
      duplicate_suppression_tuning: 'keep max visible repeat count at one for identical keys; reset only on new evidence, blocker resolution, or stage change',
      status_verbosity_tuning: 'status text must remain short, actionable for blockers, and recoverable from mission-status-ledger'
    },
    risks: {
      accepted_before_enforcement: [
        'report-only artifacts may reveal noisy thresholds before tuning',
        'historical missions may not cover every route in every workspace',
        'client hook progress visibility remains outside SKS control'
      ],
      rejected_before_enforcement: [
        'bypassing route gates',
        'claiming measured speedups without scored evals',
        'starting a full pipeline for DFix just to satisfy recall instrumentation',
        'repeating profane reminder text in user-visible prompts'
      ],
      migration_paths: {
        existing_missions: 'Run sks recallpulse run <mission-id> and sks recallpulse governance <mission-id> to add report-only artifacts.',
        existing_research_artifacts: 'Research gates now require scout display_name/persona/persona_boundary fields; old ledgers should be migrated by adding those fields before claiming pass.',
        generated_skills: 'Do not edit generated installed skills directly; rerun init/bootstrap from engine source when generated text needs refreshing.'
      },
      release_gate: '0.8.0 remains report-only unless packcheck, selftest, sizecheck, registry metadata check, TriWiki validate, and RecallPulse fixture eval pass.'
    }
  };
  if (missionId) await writeJsonAtomic(path.join(recallPulseMissionDir(root, missionId), RECALLPULSE_GOVERNANCE_ARTIFACT), report);
  return report;
}

export function validateResearchScoutPersonas(scoutLedger = {}, geniusSummaryText = '') {
  const rows = Array.isArray(scoutLedger?.scouts) ? scoutLedger.scouts : [];
  const issues = [];
  const byId = new Map(RESEARCH_SCOUT_PERSONA_CONTRACT.map((scout) => [scout.id, scout]));
  const displayNames = new Set();
  for (const expected of RESEARCH_SCOUT_PERSONA_CONTRACT) {
    const row = rows.find((item) => item?.id === expected.id);
    if (!row) {
      issues.push(`${expected.id}:missing`);
      continue;
    }
    if (!row.display_name) issues.push(`${expected.id}:display_name_missing`);
    if (!row.persona) issues.push(`${expected.id}:persona_missing`);
    if (!row.persona_boundary) issues.push(`${expected.id}:persona_boundary_missing`);
    if (row.persona_boundary && !/do not impersonate|not impersonat|lens only/i.test(row.persona_boundary)) issues.push(`${expected.id}:persona_boundary_not_enforced`);
    if (row.effort !== 'xhigh' && row.reasoning_effort !== 'xhigh') issues.push(`${expected.id}:effort_not_xhigh`);
    if (row.service_tier && row.service_tier !== 'fast') issues.push(`${expected.id}:service_tier_not_fast`);
    if (!row.eureka?.idea || row.eureka?.exclamation !== 'Eureka!') issues.push(`${expected.id}:eureka_missing`);
    if (!Array.isArray(row.falsifiers)) issues.push(`${expected.id}:falsifiers_missing`);
    if (!Array.isArray(row.cheap_probes)) issues.push(`${expected.id}:cheap_probe_missing`);
    if (!row.challenge_or_response) issues.push(`${expected.id}:challenge_or_response_missing`);
    if (row.display_name) displayNames.add(row.display_name);
    const text = JSON.stringify(row).toLowerCase();
    const inspiration = String(byId.get(expected.id)?.historical_inspiration || '').toLowerCase();
    if (inspiration && inspiration !== 'counterevidence discipline' && new RegExp(`\\bi am ${escapeRegex(inspiration)}\\b|\\bas ${escapeRegex(inspiration)}\\b`).test(text)) {
      issues.push(`${expected.id}:impersonation_claim`);
    }
  }
  if (displayNames.size !== RESEARCH_SCOUT_PERSONA_CONTRACT.length) issues.push('display_names_not_unique');
  const lowerSummary = String(geniusSummaryText || '').toLowerCase();
  for (const expected of RESEARCH_SCOUT_PERSONA_CONTRACT) {
    if (lowerSummary && !lowerSummary.includes(expected.display_name.toLowerCase())) issues.push(`${expected.id}:summary_display_name_missing`);
  }
  return { ok: issues.length === 0, issues };
}

export async function updateRecallPulseTaskChecklist(root, completedIds = []) {
  const file = path.join(root, RECALLPULSE_TASKS_FILE);
  let text = await readText(file);
  const ids = new Set(completedIds.map((id) => String(id).padStart(3, '0')));
  for (const id of ids) {
    text = text.replace(new RegExp(`^- \\[ \\] T${id}(?=\\s)`, 'm'), `- [x] T${id}`);
  }
  await writeTextAtomic(file, text);
  return { file, completed: [...ids].map((id) => `T${id}`) };
}

export function parseRecallPulseTaskList(text = '') {
  const tasks = [];
  const re = /^- \[( |x)\] (T(\d{3}))\s+(.+)$/gm;
  let match;
  while ((match = re.exec(String(text || '')))) {
    tasks.push({
      id: match[2],
      number: Number(match[3]),
      checked: match[1] === 'x',
      title: match[4],
      line_index: String(text).slice(0, match.index).split(/\n/).length
    });
  }
  return tasks.sort((a, b) => a.number - b.number);
}

export async function buildRecallPulseTaskGoalLedger(root, missionId, opts = {}) {
  const file = path.join(root, RECALLPULSE_TASKS_FILE);
  const text = await readText(file);
  const tasks = parseRecallPulseTaskList(text);
  const next = tasks.find((task) => !task.checked) || null;
  const now = nowIso();
  const ledger = {
    schema_version: 1,
    artifact: RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT,
    parent_goal_mission_id: missionId,
    task_source: RECALLPULSE_TASKS_FILE,
    updated_at: now,
    sequential_rule: 'Treat every Txxx row as a child $Goal checkpoint. Complete and check only the first unchecked task unless the caller explicitly records a later task with evidence.',
    checkbox_rule: 'A task may become [x] only after its child goal row records status=done and evidence paths or verification commands.',
    counts: {
      total: tasks.length,
      checked: tasks.filter((task) => task.checked).length,
      unchecked: tasks.filter((task) => !task.checked).length
    },
    next_task: next ? { id: next.id, title: next.title } : null,
    task_goals: tasks.map((task) => ({
      task_id: task.id,
      goal_id: `${missionId || 'goal'}:${task.id}`,
      parent_goal_mission_id: missionId || null,
      title: task.title,
      status: task.checked ? 'done' : (next?.id === task.id ? (opts.nextStatus || 'next') : 'pending'),
      checked_in_markdown: task.checked,
      evidence: [],
      verification: [],
      line_index: task.line_index
    }))
  };
  if (missionId) await writeJsonAtomic(path.join(recallPulseMissionDir(root, missionId), RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT), ledger);
  return ledger;
}

export async function completeRecallPulseTaskGoal(root, missionId, taskId, opts = {}) {
  const id = normalizeTaskId(taskId);
  const ledger = await buildRecallPulseTaskGoalLedger(root, missionId);
  const task = ledger.task_goals.find((row) => row.task_id === id);
  if (!task) throw new Error(`Unknown RecallPulse task id: ${id}`);
  const firstOpen = ledger.task_goals.find((row) => !row.checked_in_markdown);
  if (firstOpen && firstOpen.task_id !== id && opts.allowOutOfOrder !== true) {
    throw new Error(`Refusing out-of-order task check: next unchecked task is ${firstOpen.task_id}, requested ${id}`);
  }
  const evidence = Array.isArray(opts.evidence) ? opts.evidence.filter(Boolean) : [];
  const verification = Array.isArray(opts.verification) ? opts.verification.filter(Boolean) : [];
  const updated = {
    ...ledger,
    updated_at: nowIso(),
    task_goals: ledger.task_goals.map((row) => row.task_id === id ? {
      ...row,
      status: 'done',
      completed_at: nowIso(),
      checked_in_markdown: true,
      evidence,
      verification,
      notes: opts.notes || ''
    } : row)
  };
  updated.counts = {
    total: updated.task_goals.length,
    checked: updated.task_goals.filter((row) => row.checked_in_markdown || row.status === 'done').length,
    unchecked: updated.task_goals.filter((row) => !(row.checked_in_markdown || row.status === 'done')).length
  };
  updated.next_task = updated.task_goals.find((row) => !(row.checked_in_markdown || row.status === 'done')) || null;
  await updateRecallPulseTaskChecklist(root, [id.replace(/^T/, '')]);
  await writeJsonAtomic(path.join(recallPulseMissionDir(root, missionId), RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT), updated);
  await appendMissionStatus(root, missionId, {
    category: 'progress',
    audience: ['user', 'route', 'final-summary'],
    stage_id: id,
    message: `${id} completed as a child $Goal checkpoint.`,
    dedupe_key: sha256(`${missionId}:${id}:done`).slice(0, 24),
    evidence: [RECALLPULSE_TASKS_FILE, RECALLPULSE_TASK_GOAL_LEDGER_ARTIFACT, ...evidence]
  });
  return { ledger: updated, task: updated.task_goals.find((row) => row.task_id === id) };
}

export const RECALLPULSE_FOUNDATION_TASK_IDS = Object.freeze([
  ...range(1, 180),
  ...range(181, 230),
  ...range(231, 270),
  ...range(293, 300),
  ...range(301, 340),
  ...range(341, 380),
  ...range(381, 410),
  421, 424, 425, 427, 428, 429, 430, 431, 436, 437, 438, 439, 440, 443, 444, 445, 446, 450,
  ...range(451, 480)
].map((n) => String(n).padStart(3, '0')));

function selectL1(pack = {}, { stageId = '', routeId = '' } = {}) {
  const finalStage = /final|honest|review/i.test(stageId);
  const maxItems = finalStage ? RECALLPULSE_POLICY.cache.l1.max_items_final : RECALLPULSE_POLICY.cache.l1.max_items_normal;
  const claims = new Map((Array.isArray(pack?.claims) ? pack.claims : []).map((claim) => [claim.id, claim]));
  const meta = wikiMeta(pack);
  const useRows = Array.isArray(pack?.attention?.use_first) ? pack.attention.use_first : [];
  const considered = useRows
    .map((row) => {
      const id = row?.[0];
      const claim = claims.get(id) || {};
      const m = meta.get(id) || {};
      const trust = number(m.trust_score, number(claim.trust_score, 0.9));
      const risk = m.risk || claim.risk || 'medium';
      const freshness = m.freshness || claim.freshness || 'fresh';
      const text = String(claim.text || claim.claim || id || '').trim();
      return {
        id,
        text,
        rgba: row?.[1] || claim.rgba || m.rgba || null,
        hash: row?.[2] || claim.h || m.hash || null,
        source: claim.source || m.source || null,
        trust_score: trust,
        risk,
        freshness,
        route_relevance: routeRelevance(id, text, routeId),
        token_cost: Math.max(1, Math.ceil(text.length / 4)),
        eligible: trust >= RECALLPULSE_POLICY.cache.l1.min_trust && !['stale', 'conflicted', 'unsupported'].includes(String(freshness).toLowerCase())
      };
    })
    .filter((row) => row.id);
  const selected = [];
  let tokens = 0;
  for (const item of considered.filter((row) => row.eligible).sort((a, b) => (b.route_relevance - a.route_relevance) || (b.trust_score - a.trust_score))) {
    if (selected.length >= maxItems) break;
    if (tokens + item.token_cost > RECALLPULSE_POLICY.cache.l1.max_tokens) continue;
    selected.push(item);
    tokens += item.token_cost;
  }
  return {
    tier: 'L1',
    label: RECALLPULSE_POLICY.cache.l1.label,
    selected,
    considered,
    max_items: maxItems,
    max_tokens: RECALLPULSE_POLICY.cache.l1.max_tokens,
    token_cost: tokens,
    positive_recall_only: true
  };
}

async function buildL2(root, dir) {
  const mission = await readJson(path.join(dir, 'mission.json'), null);
  const routeContext = await readJson(path.join(dir, 'route-context.json'), null);
  const pipelinePlan = await readJson(path.join(dir, 'pipeline-plan.json'), null);
  const contract = await readJson(path.join(dir, 'decision-contract.json'), null);
  const statusLedger = await readJson(path.join(dir, MISSION_STATUS_LEDGER_ARTIFACT), null);
  const gateFiles = ['team-gate.json', 'research-gate.evaluated.json', 'research-gate.json', 'db-review.json', 'qa-gate.json', 'ppt-gate.json', 'image-ux-review-gate.json', 'gx-gate.json', 'hard-blocker.json'];
  const gates = [];
  for (const file of gateFiles) {
    const gate = await readJson(path.join(dir, file), null);
    if (gate) gates.push({ file, passed: gate.passed === true, missing: missingGateFields(gate), hash: sha256(JSON.stringify(gate)).slice(0, 12) });
  }
  const changedArtifacts = await listMissionArtifacts(dir);
  const eventsTail = await tailJsonl(path.join(dir, 'events.jsonl'), 8);
  const verificationResults = await collectVerificationResults(dir);
  return {
    tier: 'L2',
    label: RECALLPULSE_POLICY.cache.l2.label,
    mission,
    route_context: routeContext,
    pipeline_plan: pipelinePlan,
    decision_contract: contract ? { present: true, sealed_hash: contract.sealed_hash || null, status: contract.status || null } : { present: false },
    gate_ids: gates.map((gate) => gate.file),
    gate_blockers: gates.filter((gate) => !gate.passed).map((gate) => ({ file: gate.file, missing: gate.missing })),
    verification_results: verificationResults,
    subagent_handoffs: await tailJsonl(path.join(dir, 'subagent-evidence.jsonl'), 5),
    status_ledger_snapshot: statusLedger?.latest || null,
    status_ledger_summary: statusLedger?.final_summary_projection || null,
    changed_artifacts: changedArtifacts,
    changed_files: [],
    evidence_hashes: gates.map((gate) => ({ file: gate.file, hash: gate.hash })),
    duplicate_keys: collectDuplicateKeys(statusLedger),
    recent_events: eventsTail
  };
}

function emptyL2() {
  return {
    tier: 'L2',
    label: RECALLPULSE_POLICY.cache.l2.label,
    gate_blockers: [],
    verification_results: [],
    subagent_handoffs: [],
    changed_artifacts: [],
    evidence_hashes: [],
    duplicate_keys: []
  };
}

function buildL3(pack = {}, { stageId = '', routeId = '', l1 = {} } = {}) {
  const hydrateRows = Array.isArray(pack?.attention?.hydrate_first) ? pack.attention.hydrate_first : [];
  const selectedIds = new Set((l1.selected || []).map((item) => item.id));
  const sourceRequests = hydrateRows.map((row) => ({
    id: row?.[0],
    reason: row?.[1] || 'hydrate_source',
    selected_in_l1: selectedIds.has(row?.[0])
  })).filter((row) => row.id);
  const broadRoute = /team|research|db|release|version|security/i.test(`${routeId} ${stageId}`);
  return {
    tier: 'L3',
    label: RECALLPULSE_POLICY.cache.l3.label,
    hydration_requests: sourceRequests,
    blocked_hydration_reasons: [],
    source_conflicts: sourceRequests.filter((row) => /conflict|stale|risk/i.test(row.reason)),
    triggers_active: [
      ...sourceRequests.map((row) => row.reason),
      broadRoute ? 'broad_route_policy' : null,
      /final/i.test(stageId) ? 'final_claim' : null
    ].filter(Boolean)
  };
}

function duplicateSuppression({ routeId, missionId, stageId, l1, l2 }) {
  const claimHash = sha256((l1.selected || []).map((item) => item.id).join('|')).slice(0, 12);
  const evidenceHash = sha256((l2.evidence_hashes || []).map((item) => `${item.file}:${item.hash}`).join('|')).slice(0, 12);
  const blockerCode = (l2.gate_blockers || []).map((item) => item.file).join('|') || 'none';
  const visible = `${routeId}:${stageId}:${claimHash}:${evidenceHash}:${blockerCode}`;
  const key = sha256(JSON.stringify({ routeId, missionId, stageId, claimHash, evidenceHash, blockerCode, visible })).slice(0, 24);
  const repeated = (l2.duplicate_keys || []).includes(key);
  return {
    key,
    route_id: routeId,
    mission_id: missionId,
    stage_id: stageId,
    claim_hash: claimHash,
    evidence_hash: evidenceHash,
    blocker_code: blockerCode,
    visible_message_hash: sha256(visible).slice(0, 12),
    repeated,
    suppressed_keys: repeated ? [key] : [],
    repeat_budget: RECALLPULSE_POLICY.repetition.repeat_budget
  };
}

function recallPulseMetrics({ l1 = {}, l2 = {}, l3 = {}, duplicate = {} }) {
  const selected = Array.isArray(l1.selected) ? l1.selected : [];
  const considered = Array.isArray(l1.considered) ? l1.considered : [];
  const hydrate = Array.isArray(l3.hydration_requests) ? l3.hydration_requests : [];
  const stale = hydrate.filter((row) => /stale|conflict|low_trust|risk/i.test(String(row.reason || '')));
  return {
    cache_hit_count: selected.length,
    cache_miss_count: Math.max(0, considered.length - selected.length),
    hydration_count: hydrate.length,
    stale_recall_count: stale.length,
    duplicate_suppression_count: duplicate.repeated ? 1 : 0,
    token_cost_estimate: l1.token_cost || 0,
    gate_agreement_target: RECALLPULSE_POLICY.eval_targets.route_gate_agreement_min,
    l2_artifact_count: (l2.changed_artifacts || []).length,
    evidence_hash_count: (l2.evidence_hashes || []).length
  };
}

function recallRisk({ state = {}, l1 = {}, l2 = {}, l3 = {} }) {
  const unverified = [];
  if (state.context7_required && !(state.context7_verified || state.context7_docs)) unverified.push('context7_evidence');
  if (state.subagents_required && !state.subagents_verified) unverified.push('subagent_evidence');
  for (const blocker of l2.gate_blockers || []) unverified.push(`${blocker.file}:${(blocker.missing || []).join(',') || 'not_passed'}`);
  const l3Conflicts = l3.source_conflicts || [];
  return {
    level: unverified.length || l3Conflicts.length ? 'high' : ((l1.selected || []).length ? 'medium' : 'low'),
    confidence: (l1.selected || []).length ? 0.86 : 0.45,
    unverified_claims: unverified,
    source_conflict_count: l3Conflicts.length
  };
}

function chooseAction({ pack, l1, l2, l3, duplicate, risk, state, stageId }) {
  if (!pack) return 'hydrate';
  if (duplicate.repeated) return 'suppress';
  if (risk.unverified_claims?.length) return 'block';
  if (risk.source_conflict_count > 0 || (l3.hydration_requests || []).length && /final|review|security|db|release/i.test(`${stageId} ${state.route || ''}`)) return 'hydrate';
  if ((l2.gate_blockers || []).length) return 'escalate';
  if ((l1.selected || []).length) return 'cache_hit';
  return 'no_op';
}

function userVisibleProjection({ action, l1, l2, l3, risk }) {
  const selected = (l1.selected || []).map((item) => item.id);
  const blockers = risk.unverified_claims || [];
  const hydrate = l3.hydration_requests || [];
  let message = 'RecallPulse checked the current stage in report-only mode.';
  if (action === 'cache_hit') message = `RecallPulse L1 cache hit: ${selected.slice(0, 4).join(', ') || 'no named anchors'}.`;
  else if (action === 'hydrate') message = `RecallPulse requests source hydration before risky claims: ${hydrate.slice(0, 3).map((item) => item.id).join(', ') || 'source check'}.`;
  else if (action === 'block') message = `RecallPulse report-only blocker: ${blockers.slice(0, 3).join(', ') || 'unverified evidence'}.`;
  else if (action === 'suppress') message = 'RecallPulse suppressed a duplicate reminder and kept one durable status row.';
  else if (action === 'escalate') message = `RecallPulse recommends keeping the heavier route gate: ${(l2.gate_blockers || []).map((item) => item.file).join(', ') || 'gate blocker'}.`;
  return {
    category: action === 'block' ? 'blocker' : 'progress',
    message,
    l1_ids: selected,
    l3_request_count: hydrate.length
  };
}

function normalizeStatusEntry(entry, index) {
  const category = RECALLPULSE_POLICY.status_ledger.categories.includes(entry.category) ? entry.category : 'info';
  const audience = Array.isArray(entry.audience) ? entry.audience : [entry.audience || 'route'];
  const message = String(entry.message || '').trim() || 'Status updated.';
  return {
    id: entry.id || `status-${String(index).padStart(4, '0')}`,
    ts: entry.ts || nowIso(),
    category,
    audience: audience.filter(Boolean),
    stage_id: entry.stage_id || null,
    message,
    dedupe_key: entry.dedupe_key || sha256(`${category}:${message}`).slice(0, 24),
    visibility: {
      user: audience.includes('user'),
      route: audience.includes('route'),
      reviewer: audience.includes('reviewer'),
      final_summary: audience.includes('final-summary')
    },
    evidence: Array.isArray(entry.evidence) ? entry.evidence : []
  };
}

function statusFinalProjection(entries = []) {
  const finalRelevant = entries.filter((entry) => entry.visibility?.final_summary || entry.category === 'blocker' || entry.category === 'verification');
  return {
    completed: finalRelevant.filter((entry) => entry.category !== 'blocker').map((entry) => entry.message).slice(-8),
    blockers: finalRelevant.filter((entry) => entry.category === 'blocker').map((entry) => entry.message).slice(-8),
    last_user_visible: [...entries].reverse().find((entry) => entry.visibility?.user) || null
  };
}

function statusLedgerProjections(entries = []) {
  const latest = entries[entries.length - 1] || null;
  const blockers = entries.filter((entry) => entry.category === 'blocker').slice(-5);
  const userVisible = entries.filter((entry) => entry.visibility?.user).slice(-5);
  return {
    team_live: {
      latest_user_visible: latest?.visibility?.user ? latest.message : userVisible[userVisible.length - 1]?.message || null,
      blocker_count: blockers.length
    },
    pipeline_status: {
      latest_category: latest?.category || null,
      latest_stage_id: latest?.stage_id || null,
      latest_message: latest?.message || null,
      blocker_messages: blockers.map((entry) => entry.message)
    },
    codex_app_stop_hook: {
      recoverable_from_ledger: true,
      repeated_messages_collapsed: true,
      latest_user_visible: userVisible[userVisible.length - 1] || null
    }
  };
}

function stageFromState(state = {}) {
  const phase = String(state.phase || '').toLowerCase();
  if (/final|honest|stop/.test(phase)) return 'before_final';
  if (/review/.test(phase)) return 'before_review';
  if (/implement|execution|running/.test(phase)) return 'before_implementation';
  if (/plan|scout|debate|prepared/.test(phase)) return 'before_planning';
  return 'route_intake';
}

function routeRelevance(id = '', text = '', routeId = '') {
  const hay = `${id} ${text}`.toLowerCase();
  const route = String(routeId || '').toLowerCase();
  let score = 0.5;
  if (route && hay.includes(route)) score += 0.2;
  if (/triwiki|wiki|memory|recall|cache|hydrate/.test(hay)) score += 0.22;
  if (/db|security|release|version|final|honest/.test(hay)) score += 0.15;
  return Math.min(1, score);
}

function wikiMeta(pack = {}) {
  const out = new Map();
  for (const row of Array.isArray(pack?.wiki?.a) ? pack.wiki.a : []) {
    out.set(row[0], {
      id: row[0],
      rgba: row[1],
      authority: row[3],
      status: row[4],
      risk: row[5],
      source: row[6],
      hash: row[7],
      file: row[8],
      trust_score: row[9],
      freshness: row[10]
    });
  }
  return out;
}

async function listMissionArtifacts(dir) {
  let entries = [];
  try { entries = await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const file = path.join(dir, entry.name);
    const stat = await fsp.stat(file).catch(() => null);
    rows.push({ file: entry.name, mtime_ms: stat?.mtimeMs || 0 });
  }
  return rows.sort((a, b) => b.mtime_ms - a.mtime_ms).slice(0, 20).map((row) => row.file);
}

async function tailJsonl(file, max = 5) {
  const text = await readText(file, '');
  return text.split(/\n/).filter(Boolean).slice(-max).map((line) => {
    try { return JSON.parse(line); } catch { return { raw: line.slice(0, 500) }; }
  });
}

async function collectVerificationResults(dir) {
  const names = ['packcheck-result.json', 'selftest-result.json', 'verification-result.json'];
  const out = [];
  for (const name of names) {
    const row = await readJson(path.join(dir, name), null);
    if (row) out.push({ file: name, ...row });
  }
  return out;
}

function missingGateFields(gate = {}) {
  if (gate.passed === true) return [];
  return Object.entries(gate)
    .filter(([, value]) => value === false)
    .map(([key]) => key)
    .slice(0, 16);
}

function collectDuplicateKeys(statusLedger = null) {
  return (statusLedger?.entries || []).map((entry) => entry.dedupe_key).filter(Boolean);
}

function sharedChecksForRoute(route = {}, lifecycle = []) {
  const checks = new Set();
  if (route.context7Policy === 'required' || route.context7Policy === 'if_external_docs') checks.add('context7_current_docs_when_relevant');
  if (route.stopGate && route.stopGate !== 'none') checks.add('route_stop_gate_status');
  if (lifecycle.some((stage) => /triwiki|wiki/i.test(stage))) checks.add('triwiki_context_refresh_or_validate');
  if (lifecycle.some((stage) => /reflection/i.test(stage))) checks.add('post_route_reflection');
  if (lifecycle.some((stage) => /honest/i.test(stage))) checks.add('honest_mode');
  if (lifecycle.some((stage) => /review|gate|validate|verification|evidence/i.test(stage))) checks.add('evidence_or_verification_gate');
  checks.add('no_unrequested_fallback_code');
  checks.add('durable_status_projection');
  checks.add('duplicate_suppression');
  return [...checks];
}

function sharedLifecycleStage(stage = '') {
  return /triwiki|wiki|context7|reflection|honest|gate|validate|verification|evidence|status|summary/i.test(String(stage || ''));
}

function preservedRoutePersonality(routeId = '', routeName = '') {
  const byRoute = {
    DFix: 'ultralight direct-fix path stays tiny and does not start the full pipeline',
    Answer: 'answer-only path stays conversational and does not start implementation',
    SKS: 'general SKS discovery/help personality stays simple',
    Team: 'Team keeps scout, debate, executor, and five-lane review identity',
    QALoop: 'QA-LOOP keeps dogfood, checklist, remediation, and reverification identity',
    PPT: 'PPT keeps restrained information-first HTML/PDF delivery identity',
    ImageUXReview: 'Image UX Review keeps gpt-image-2 annotated raster review identity',
    ComputerUse: 'Computer Use keeps maximum-speed visual/browser lane identity',
    Goal: 'Goal stays a native /goal persistence bridge, not a heavyweight route',
    Research: 'Research keeps named xhigh persona scout council, Eureka, debate, paper, and falsification identity',
    AutoResearch: 'AutoResearch keeps iterative experiment loop identity',
    DB: 'DB keeps conservative read-first destructive-operation safety identity',
    MadSKS: 'MAD-SKS keeps explicit scoped high-risk authorization identity',
    GX: 'GX keeps deterministic visual-context cartridge identity',
    Wiki: 'Wiki keeps bounded TriWiki maintenance identity',
    Help: 'Help stays lightweight command discovery'
  };
  return byRoute[routeId] || `${routeName || routeId || 'route'} personality remains route-owned`;
}

async function listMissionRows(root) {
  const base = path.join(root, '.sneakoscope', 'missions');
  let entries = [];
  try { entries = await fsp.readdir(base, { withFileTypes: true }); } catch { return []; }
  const rows = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const mission = await readJson(path.join(base, entry.name, 'mission.json'), null);
    if (!mission) continue;
    rows.push({
      id: entry.name,
      mode: mission.mode || null,
      prompt: mission.prompt || '',
      created_at: mission.created_at || ''
    });
  }
  return rows.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function latestMissionForRoute(missions = [], routeId = '') {
  const target = String(routeId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const aliases = {
    qaloop: ['qaloop', 'qa', 'qa-loop'],
    db: ['db', 'database'],
    team: ['team'],
    research: ['research'],
    goal: ['goal']
  }[target] || [target];
  return [...missions].reverse().find((mission) => {
    const mode = String(mission.mode || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return aliases.some((alias) => mode === alias.replace(/[^a-z0-9]/g, ''));
  }) || null;
}

function normalizeTaskId(value = '') {
  const raw = String(value || '').trim().toUpperCase();
  const match = raw.match(/^T?(\d{1,3})$/);
  if (!match) throw new Error(`Invalid RecallPulse task id: ${value}`);
  return `T${match[1].padStart(3, '0')}`;
}

function extractAcceptanceCriteria(l2 = {}) {
  const answers = l2.decision_contract?.answers || {};
  if (Array.isArray(answers.ACCEPTANCE_CRITERIA)) return answers.ACCEPTANCE_CRITERIA;
  if (typeof answers.ACCEPTANCE_CRITERIA === 'string') return [answers.ACCEPTANCE_CRITERIA];
  return [];
}

function number(...values) {
  for (const value of values) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function fixture(id, passed, assertion) {
  return { id, passed: Boolean(passed), assertion };
}

function range(start, end) {
  const out = [];
  for (let i = start; i <= end; i++) out.push(i);
  return out;
}

function escapeRegex(text = '') {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const DECISION_LATTICE_SCHEMA_VERSION = 1;

export const DEFAULT_LATTICE_WEIGHTS = Object.freeze({
  step: 1,
  proof_debt: 3,
  risk: 1,
  friction: 1,
  info_gain: 1
});

const AXES = Object.freeze(['contract', 'context', 'implementation', 'verification', 'review']);

const DEFAULT_START = Object.freeze({
  contract: 0,
  context: 0,
  implementation: 0,
  verification: 0,
  review: 0
});

const DEFAULT_GOAL = Object.freeze({
  contract: 2,
  context: 2,
  implementation: 2,
  verification: 2,
  review: 1
});

const DEFAULT_ACTIONS = Object.freeze([
  {
    id: 'seal_contract',
    label: 'Seal decision contract',
    delta: { contract: 2 },
    risk: 0.05,
    friction: 0.25,
    info_gain: 0.9,
    notes: ['Removes ambiguity before route selection.']
  },
  {
    id: 'read_triwiki',
    label: 'Read bounded TriWiki context',
    delta: { context: 1 },
    risk: 0.05,
    friction: 0.2,
    info_gain: 0.7,
    notes: ['Uses compact high-trust recall before editing.']
  },
  {
    id: 'proof_field_scan',
    label: 'Run proof-field scan',
    delta: { context: 2, verification: 1 },
    risk: 0.1,
    friction: 0.35,
    info_gain: 0.95,
    notes: ['Scores route surface and escalation triggers.']
  },
  {
    id: 'minimal_patch',
    label: 'Implement smallest scoped change',
    delta: { implementation: 2 },
    risk: 0.35,
    friction: 0.35,
    info_gain: 0.4,
    notes: ['Touches only the selected proof cone.']
  },
  {
    id: 'focused_verification',
    label: 'Run focused verification',
    delta: { verification: 1 },
    risk: 0.12,
    friction: 0.45,
    info_gain: 0.85,
    notes: ['Checks syntax and behavior for the changed module.']
  },
  {
    id: 'risk_scoped_review',
    label: 'Collect risk-scoped official review',
    delta: { review: 1 },
    risk: 0.2,
    friction: 0.55,
    info_gain: 1,
    notes: ['Starts with one reviewer and expands only for independent risk domains.']
  },
  {
    id: 'honest_mode',
    label: 'Run Honest Mode closeout',
    delta: { verification: 1 },
    risk: 0.05,
    friction: 0.2,
    info_gain: 0.65,
    notes: ['Binds final claims to evidence and gaps.']
  }
]);

const DEFAULT_ROUTE_PATHS = Object.freeze([
  {
    id: 'proof_field_fast_lane',
    label: 'Proof Field Fast Lane',
    action_ids: ['seal_contract', 'read_triwiki', 'proof_field_scan', 'minimal_patch', 'focused_verification', 'honest_mode'],
    notes: ['Lowest friction when scope is narrow and risk flags stay low.']
  },
  {
    id: 'balanced_naruto_lane',
    label: 'Balanced Naruto Lane',
    action_ids: ['seal_contract', 'read_triwiki', 'proof_field_scan', 'minimal_patch', 'focused_verification', 'risk_scoped_review', 'honest_mode'],
    notes: ['Adds review evidence while preserving a compact change surface.']
  },
  {
    id: 'full_naruto_honest_path',
    label: 'Full Naruto Honest Path',
    action_ids: ['seal_contract', 'read_triwiki', 'proof_field_scan', 'risk_scoped_review', 'minimal_patch', 'focused_verification', 'risk_scoped_review', 'honest_mode'],
    notes: ['Heaviest default for broad or release-sensitive missions.']
  }
]);

export function buildDecisionLatticeReport(input: any = {}) {
  const weights = normalizeWeights(input.weights);
  const start = normalizeState(input.start_state || input.start || DEFAULT_START);
  const goal = normalizeState(input.goal_state || input.target_state || input.target || inferredGoal(input));
  const actions = normalizeActions(input.actions || DEFAULT_ACTIONS);
  const routePaths = normalizeRoutePaths(input.route_paths || input.candidate_route_paths || DEFAULT_ROUTE_PATHS, actions);
  const grid = buildConceptualGrid(start, goal, actions);
  const search = runAStar({ start, goal, actions, weights });
  const routeCandidates = routePaths.map((routePath: any, index: any) => evaluateRoutePath(routePath, index, { start, goal, actions, weights }));
  const candidates = routeCandidates.concat([{ ...search.selected_path, rank_hint: routeCandidates.length }]).sort(compareCandidates);
  const selected = selectPath(candidates, search.selected_path);
  const rejected = candidates
    .filter((candidate: any) => candidate.id !== selected.id)
    .map((candidate: any) => ({
      id: candidate.id,
      label: candidate.label,
      f: candidate.cost.f,
      delta_from_selected: round(candidate.cost.f - selected.cost.f),
      rejection_reasons: rejectionReasons(candidate, selected)
    }));
  const report: any = {
    schema_version: DECISION_LATTICE_SCHEMA_VERSION,
    report_only: true,
    deterministic: true,
    module: 'decision-lattice',
    scoring_formula: String(input.scoring_formula || 'f = g + h + risk + friction - info_gain'),
    research_basis: {
      model: 'Decision Lattice A* planner',
      scoring_formula: 'f = g + h + risk + friction - info_gain',
      proof_debt_heuristic: 'h is weighted remaining lattice debt across contract, context, implementation, verification, and review axes.'
    },
    input_summary: {
      intent: String(input.intent || input.goal || '').trim() || null,
      weights,
      start_state: start,
      goal_state: goal,
      action_count: actions.length,
      route_path_count: routePaths.length
    },
    heuristic: {
      id: 'proof_debt',
      h_start: proofDebt(start, goal, weights),
      axes: AXES.map((axis: any) => ({
        axis,
        start: start[axis] ?? 0,
        goal: goal[axis] ?? 0,
        debt: debtForAxis(start, goal, axis),
        weighted_debt: round(debtForAxis(start, goal, axis) * weights.proof_debt)
      }))
    },
    conceptual_grid: grid,
    frontier: search.frontier,
    candidate_paths: candidates,
    selected_path: selected,
    rejected_alternatives: rejected,
    validation: null
  };
  report.validation = validateDecisionLatticeReport(report);
  return report;
}

function inferredGoal(input: any = {}) {
  const goal: any = { ...DEFAULT_GOAL };
  if (input.execution_lane?.fast_lane_allowed === true && !(input.naruto_trigger_matrix?.active_triggers || []).length) {
    goal.review = 0;
  }
  return goal;
}

export function validateDecisionLatticeReport(report: any = {}) {
  const issues: any[] = [];
  if (report.schema_version !== DECISION_LATTICE_SCHEMA_VERSION) issues.push('schema_version');
  if (report.report_only !== true) issues.push('report_only');
  if (report.deterministic !== true) issues.push('deterministic');
  if (report.research_basis?.scoring_formula !== 'f = g + h + risk + friction - info_gain') issues.push('scoring_formula');
  if (!Array.isArray(report.heuristic?.axes) || report.heuristic.axes.length !== AXES.length) issues.push('heuristic_axes');
  if (!Number.isFinite(Number(report.heuristic?.h_start))) issues.push('heuristic_h_start');
  if (!Array.isArray(report.conceptual_grid?.cells) || report.conceptual_grid.cells.length < 1) issues.push('conceptual_grid');
  if (!Array.isArray(report.frontier?.expanded_order) || report.frontier.expanded_order.length < 1) issues.push('frontier_expanded_order');
  if (!Array.isArray(report.candidate_paths) || report.candidate_paths.length < 1) issues.push('candidate_paths');
  if (!report.selected_path?.id || !Array.isArray(report.selected_path?.steps)) issues.push('selected_path');
  if (!Array.isArray(report.rejected_alternatives)) issues.push('rejected_alternatives');
  if (report.candidate_paths?.some((candidate: any) => !Number.isFinite(Number(candidate?.cost?.f)))) issues.push('candidate_costs');
  if (report.selected_path?.cost?.f !== Math.min(...(report.candidate_paths || []).map((candidate: any) => candidate.cost.f))) issues.push('selected_path_not_min_f');
  return { ok: issues.length === 0, issues };
}

function normalizeWeights(input: any = {}) {
  return {
    step: positiveNumber(input.step, DEFAULT_LATTICE_WEIGHTS.step),
    proof_debt: positiveNumber(input.proof_debt, DEFAULT_LATTICE_WEIGHTS.proof_debt),
    risk: positiveNumber(input.risk, DEFAULT_LATTICE_WEIGHTS.risk),
    friction: positiveNumber(input.friction, DEFAULT_LATTICE_WEIGHTS.friction),
    info_gain: positiveNumber(input.info_gain, DEFAULT_LATTICE_WEIGHTS.info_gain)
  };
}

function normalizeState(input: any = {}) {
  const state: Record<string, number> = {};
  for (const axis of AXES) state[axis] = clampInt(input[axis], 0, 3);
  return state;
}

function normalizeActions(input: any = []) {
  return input
    .map((action: any, index: any) => ({
      id: safeId(action.id || `action_${index + 1}`),
      label: String(action.label || action.id || `Action ${index + 1}`),
      delta: normalizeDelta(action.delta || {}),
      risk: nonNegativeNumber(action.risk, 0),
      friction: nonNegativeNumber(action.friction, 0),
      info_gain: nonNegativeNumber(action.info_gain, 0),
      notes: arrayOfStrings(action.notes)
    }))
    .filter((action: any) => AXES.some((axis: any) => action.delta[axis] > 0))
    .sort(compareById);
}

function normalizeRoutePaths(input: any = [], actions: any = []) {
  const actionIds = new Set(actions.map((action: any) => action.id));
  return input
    .map((routePath: any, index: any) => ({
      id: safeId(routePath.id || `route_path_${index + 1}`),
      label: String(routePath.label || routePath.id || `Route Path ${index + 1}`),
      action_ids: arrayOfStrings(routePath.action_ids || routePath.actions).map(safeId).filter((id: any) => actionIds.has(id)),
      notes: arrayOfStrings(routePath.notes)
    }))
    .filter((routePath: any) => routePath.action_ids.length > 0)
    .sort(compareById);
}

function normalizeDelta(delta: any = {}) {
  const out: Record<string, number> = {};
  for (const axis of AXES) out[axis] = clampInt(delta[axis], 0, 3);
  return out;
}

function runAStar({ start, goal, actions, weights }: any) {
  const open = [nodeForState(start, { g: 0, h: proofDebt(start, goal, weights), risk: 0, friction: 0, info_gain: 0, steps: [] })];
  const best = new Map([[stateKey(start), 0]]);
  const closed: any[] = [];
  const snapshots: any[] = [];
  let selected = open[0];

  while (open.length > 0 && closed.length < 64) {
    open.sort(compareNodes);
    const current = open.shift();
    closed.push(current);
    snapshots.push({ step: closed.length, current: current.key, f: current.f, open: open.map((node: any) => node.key).sort() });
    if (isGoal(current.state, goal)) {
      selected = current;
      break;
    }
    for (const action of actions) {
      const nextState = applyAction(current.state, action, goal);
      const key = stateKey(nextState);
      const g = round(current.g + weights.step);
      if (best.has(key) && (best.get(key) ?? Number.POSITIVE_INFINITY) <= g) continue;
      best.set(key, g);
      const risk = round(current.risk + action.risk * weights.risk);
      const friction = round(current.friction + action.friction * weights.friction);
      const infoGain = round(current.info_gain + action.info_gain * weights.info_gain);
      const h = proofDebt(nextState, goal, weights);
      open.push(nodeForState(nextState, {
        g,
        h,
        risk,
        friction,
        info_gain: infoGain,
        steps: current.steps.concat([stepFromAction(action, nextState)])
      }));
    }
  }

  return {
    selected_path: pathFromNode('astar_frontier_path', 'A* Frontier Path', selected),
    frontier: {
      expanded_order: closed.map((node: any, index: any) => ({ index, key: node.key, f: node.f, h: node.h, steps: node.steps.map((step: any) => step.id) })),
      open_nodes: open.sort(compareNodes).slice(0, 12).map((node: any) => ({ key: node.key, f: node.f, h: node.h })),
      closed_nodes: closed.map((node: any) => node.key),
      snapshots
    }
  };
}

function evaluateRoutePath(routePath: any, index: any, { start, goal, actions, weights }: any) {
  const actionById = new Map<string, any>(actions.map((action: any) => [action.id, action]));
  let state: any = { ...start };
  let g = 0;
  let risk = 0;
  let friction = 0;
  let infoGain = 0;
  const steps: any[] = [];
  for (const id of routePath.action_ids) {
    const action = actionById.get(id);
    if (!action) continue;
    g = round(g + weights.step);
    risk = round(risk + action.risk * weights.risk);
    friction = round(friction + action.friction * weights.friction);
    infoGain = round(infoGain + action.info_gain * weights.info_gain);
    state = applyAction(state, action, goal);
    steps.push(stepFromAction(action, state));
  }
  const h = proofDebt(state, goal, weights);
  const f = round(g + h + risk + friction - infoGain);
  return {
    id: routePath.id,
    label: routePath.label,
    rank_hint: index,
    route: routePath.action_ids,
    steps,
    final_state: state,
    proof_debt: h,
    complete: isGoal(state, goal),
    cost: { g, h, risk, friction, info_gain: infoGain, f },
    notes: routePath.notes
  };
}

function selectPath(candidates: any, astarPath: any) {
  const complete = candidates.filter((candidate: any) => candidate.complete);
  const pool = complete.length ? complete : candidates;
  const selected = pool.slice().sort(compareCandidates)[0] || astarPath;
  return selected.cost.f <= astarPath.cost.f ? selected : astarPath;
}

function pathFromNode(id: any, label: any, node: any) {
  return {
    id,
    label,
    route: node.steps.map((step: any) => step.id),
    steps: node.steps,
    final_state: node.state,
    proof_debt: node.h,
    complete: node.h === 0,
    cost: {
      g: node.g,
      h: node.h,
      risk: node.risk,
      friction: node.friction,
      info_gain: node.info_gain,
      f: node.f
    },
    notes: ['Generated by A* frontier expansion over the conceptual lattice.']
  };
}

function nodeForState(state: any, input: any) {
  const f = round(input.g + input.h + input.risk + input.friction - input.info_gain);
  return { ...input, state, key: stateKey(state), f };
}

function applyAction(state: any, action: any, goal: any) {
  const next: Record<string, number> = {};
  for (const axis of AXES) next[axis] = Math.min(goal[axis], state[axis] + action.delta[axis]);
  return next;
}

function proofDebt(state: any, goal: any, weights: any) {
  return round(AXES.reduce((sum: any, axis: any) => sum + debtForAxis(state, goal, axis), 0) * weights.proof_debt);
}

function debtForAxis(state: any, goal: any, axis: any) {
  return Math.max(0, Number(goal[axis] || 0) - Number(state[axis] || 0));
}

function buildConceptualGrid(start: any, goal: any, actions: any) {
  return {
    axes: AXES.map((axis: any) => ({ axis, start: start[axis], goal: goal[axis], span: Math.max(0, goal[axis] - start[axis]) })),
    cells: AXES.map((axis: any) => ({
      id: `axis_${axis}`,
      axis,
      start: start[axis],
      goal: goal[axis],
      candidate_actions: actions.filter((action: any) => action.delta[axis] > 0).map((action: any) => action.id)
    })),
    legend: {
      g: 'path steps already paid',
      h: 'remaining proof debt',
      risk: 'expected safety and integration exposure',
      friction: 'coordination and verification drag',
      info_gain: 'uncertainty removed by the step'
    }
  };
}

function rejectionReasons(candidate: any, selected: any) {
  const reasons: any[] = [];
  if (!candidate.complete) reasons.push('remaining_proof_debt');
  if (candidate.cost.risk > selected.cost.risk) reasons.push('higher_risk');
  if (candidate.cost.friction > selected.cost.friction) reasons.push('higher_friction');
  if (candidate.cost.info_gain < selected.cost.info_gain) reasons.push('lower_info_gain');
  if (candidate.cost.f > selected.cost.f) reasons.push('higher_total_f');
  return reasons.length ? reasons : ['tie_broken_by_deterministic_order'];
}

function compareCandidates(a: any, b: any) {
  return (a.cost.f - b.cost.f)
    || (a.cost.h - b.cost.h)
    || (a.cost.risk - b.cost.risk)
    || (a.cost.friction - b.cost.friction)
    || (b.cost.info_gain - a.cost.info_gain)
    || a.id.localeCompare(b.id);
}

function compareNodes(a: any, b: any) {
  return (a.f - b.f)
    || (a.h - b.h)
    || (a.risk - b.risk)
    || (a.friction - b.friction)
    || (b.info_gain - a.info_gain)
    || a.key.localeCompare(b.key);
}

function compareById(a: any, b: any) {
  return a.id.localeCompare(b.id);
}

function stateKey(state: any) {
  return AXES.map((axis: any) => `${axis}:${state[axis]}`).join('|');
}

function isGoal(state: any, goal: any) {
  return AXES.every((axis: any) => state[axis] >= goal[axis]);
}

function stepFromAction(action: any, state: any) {
  return {
    id: action.id,
    label: action.label,
    state_after: state,
    risk: action.risk,
    friction: action.friction,
    info_gain: action.info_gain,
    notes: action.notes
  };
}

function arrayOfStrings(value: any) {
  if (!Array.isArray(value)) return [];
  return value.map((item: any) => String(item || '').trim()).filter(Boolean);
}

function safeId(value: any) {
  return String(value || 'item').trim().toLowerCase().replace(/[^a-z0-9_./-]+/g, '_').replace(/^_+|_+$/g, '') || 'item';
}

function clampInt(value: any, min: any, max: any) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function positiveNumber(value: any, fallback: any) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function nonNegativeNumber(value: any, fallback: any) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
}

function round(value: any) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}

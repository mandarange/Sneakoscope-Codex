import { nowIso } from '../fsx.mjs';
import { FIVE_SCOUT_STAGE_ID, SCOUT_COUNT, SCOUT_GATE_OUTPUTS, SCOUT_REQUIRED_OUTPUTS, SCOUT_ROLES, SCOUT_TEAM_PLAN_SCHEMA } from './scout-schema.mjs';

const SCOUT_REQUIRED_ROUTE_KEYS = new Set([
  'team',
  'qaloop',
  'qa-loop',
  'research',
  'autoresearch',
  'ppt',
  'imageuxreview',
  'image-ux-review',
  'uxreview',
  'ux-review',
  'visualreview',
  'visual-review',
  'uiuxreview',
  'ui-ux-review',
  'fromchatimg',
  'from-chat-img',
  'computeruse',
  'computer-use',
  'cu',
  'db',
  'gx',
  'madsks',
  'mad-sks'
]);

const LIGHTWEIGHT_ROUTE_KEYS = new Set([
  'answer',
  'dfix',
  'help',
  'commit',
  'commitandpush',
  'commit-and-push',
  'version',
  'root',
  'sks'
]);

export function normalizeScoutRoute(route) {
  if (!route) return '';
  const raw = typeof route === 'string'
    ? route
    : (route.command || route.id || route.mode || route.route || '');
  return String(raw)
    .replace(/^\$/, '')
    .replace(/[^A-Za-z0-9-]+/g, '')
    .toLowerCase();
}

export function scoutRouteLabel(route) {
  if (!route) return '$SKS';
  if (typeof route === 'string') return route.startsWith('$') ? route : `$${route}`;
  return route.command || (route.id ? `$${route.id}` : '$SKS');
}

export function routeRequiresScoutIntake(route, opts = {}) {
  if (opts.noScouts || opts.disabled || opts.scouts === false) return false;
  if (opts.force || opts.forceScouts || opts.scouts === SCOUT_COUNT) return true;
  const key = normalizeScoutRoute(route);
  if (!key) return false;
  if (LIGHTWEIGHT_ROUTE_KEYS.has(key)) return false;
  if (key === 'wiki') {
    const task = String(opts.task || opts.prompt || '');
    return Boolean(opts.stateful || opts.visual || opts.proof || /(stateful|visual|image|voxel|proof|route|mission|gate|completion)/i.test(task));
  }
  if (key === 'goal') {
    const task = String(opts.task || opts.prompt || '');
    return /(implement|build|add|fix|test|verify|release|publish|run|execute|구현|수정|추가|검증|테스트|배포|실행)/i.test(task);
  }
  return SCOUT_REQUIRED_ROUTE_KEYS.has(key);
}

export function normalizeScoutPolicy(route, task = '', input = {}) {
  const force = Boolean(input.force || input.forceScouts || input.force_scouts);
  const noScouts = Boolean(input.noScouts || input.no_scouts || input.disabled || input.scouts === false);
  const explicitScoutCount = Object.hasOwn(input, 'count') || Object.hasOwn(input, 'scouts');
  const count = Number(input.count ?? input.scouts ?? SCOUT_COUNT);
  const requestedCount = Number.isFinite(count) ? count : SCOUT_COUNT;
  const required = routeRequiresScoutIntake(route, {
    task,
    force,
    noScouts,
    scouts: explicitScoutCount && requestedCount === SCOUT_COUNT ? SCOUT_COUNT : undefined,
    stateful: input.stateful,
    visual: input.visual,
    proof: input.proof
  });
  return {
    required,
    force,
    disabled: noScouts,
    scout_count: required ? SCOUT_COUNT : 0,
    requested_count: requestedCount,
    read_only: true,
    stage_id: FIVE_SCOUT_STAGE_ID,
    outputs: SCOUT_GATE_OUTPUTS,
    reason: required
      ? (force ? 'forced_by_pipeline_plan' : 'serious_route_default')
      : (noScouts ? 'explicitly_disabled_by_sealed_contract' : 'lightweight_or_non_stateful_route')
  };
}

export function buildScoutTeamPlan({
  missionId = null,
  route = '$Team',
  task = '',
  parallelMode = 'parallel',
  mode = 'auto',
  timeBudget = {},
  scouts = SCOUT_ROLES,
  createdAt = nowIso()
} = {}) {
  return {
    schema: SCOUT_TEAM_PLAN_SCHEMA,
    mission_id: missionId,
    route: scoutRouteLabel(route),
    task,
    created_at: createdAt,
    mode,
    parallel_mode: parallelMode,
    scout_count: SCOUT_COUNT,
    read_only: true,
    scouts: scouts.map((scout) => ({
      id: scout.id,
      role: scout.role,
      status: 'pending',
      write_policy: 'read_only'
    })),
    time_budget: {
      soft_seconds: Number(timeBudget.soft_seconds || timeBudget.softSeconds || 120),
      hard_seconds: Number(timeBudget.hard_seconds || timeBudget.hardSeconds || 300)
    },
    required_outputs: SCOUT_REQUIRED_OUTPUTS
  };
}

export function scoutPipelineStage(policy = { required: true }) {
  return {
    id: FIVE_SCOUT_STAGE_ID,
    status: policy.required ? 'required' : 'skipped',
    reason: policy.reason || (policy.required ? 'serious_route_default' : 'lightweight_or_disabled'),
    scout_count: policy.required ? SCOUT_COUNT : 0,
    read_only: true,
    outputs: SCOUT_GATE_OUTPUTS
  };
}

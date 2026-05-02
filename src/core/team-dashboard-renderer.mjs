import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from './fsx.mjs';
import { ARTIFACT_FILES, validateTeamDashboardState } from './artifact-schemas.mjs';

export const TEAM_DASHBOARD_PANES = [
  'Mission Overview',
  'Agent Lanes',
  'Task DAG',
  'QA and Dogfood',
  'Artifacts and Evidence',
  'Performance',
  'Memory Attention',
  'Forget Queue',
  'Skill Autopilot',
  'Mistake Immunity',
  'Code Structure',
  'From-Chat-IMG Visual Map'
];

export async function buildTeamDashboardState(dir, opts = {}) {
  const mission = opts.mission || await readJson(path.join(dir, 'mission.json'), {});
  const dashboard = await readJson(path.join(dir, 'team-dashboard.json'), {});
  const runtime = await readJson(path.join(dir, 'team-runtime-tasks.json'), {});
  const gate = await readJson(path.join(dir, 'team-gate.json'), {});
  const dogfood = await readJson(path.join(dir, 'dogfood-report.json'), null);
  const visualMap = await readJson(path.join(dir, 'from-chat-img-visual-map.json'), null);
  const memorySweep = await readJson(path.join(dir, 'memory-sweep-report.json'), null);
  const skillForge = await readJson(path.join(dir, 'skill-forge-report.json'), null);
  const mistakeMemory = await readJson(path.join(dir, 'mistake-memory-report.json'), null);
  const codeStructure = await readJson(path.join(dir, 'code-structure-report.json'), null);
  const isFromChat = Boolean(visualMap || gate.from_chat_img_required);
  return {
    schema_version: 1,
    updated_at: nowIso(),
    panes: isFromChat ? TEAM_DASHBOARD_PANES : TEAM_DASHBOARD_PANES.filter((pane) => pane !== 'From-Chat-IMG Visual Map'),
    mission: {
      id: mission.id || dashboard.mission_id || opts.missionId || 'unknown',
      route: mission.mode || opts.route || 'team',
      effort: opts.effort || (isFromChat ? 'forensic_vision' : 'high'),
      phase: opts.phase || 'intake',
      progress_pct: Number(opts.progress_pct || 0),
      next_action: opts.next_action || 'continue mission lifecycle'
    },
    gates: Object.entries(gate || {}).filter(([, value]) => typeof value === 'boolean').map(([name, value]) => ({ name, status: value ? 'pass' : 'fail', evidence: [] })),
    agents: Object.entries(dashboard.agents || {}).map(([id, value]) => ({ id, role: value.role || null, status: value.status || 'pending', current_task: value.phase || null })),
    tasks: (runtime.tasks || []).map((task) => ({ id: task.task_id, deps: task.depends_on || [], status: task.status || 'pending' })),
    qa: {
      failed_checks: (dogfood?.findings || []).filter((finding) => finding.post_fix_verification === 'failed').map((finding) => finding.id),
      unresolved_fixable_findings: Number(dogfood?.unresolved_fixable_findings || 0)
    },
    performance: {
      elapsed_ms: Number(opts.elapsed_ms || 0),
      route_ms: Number(opts.route_ms || 0),
      context_build_ms: Number(opts.context_build_ms || 0),
      dashboard_render_ms: Number(opts.dashboard_render_ms || 0),
      slowest_operations: opts.slowest_operations || []
    },
    artifacts: opts.artifacts || ['team-plan.json', 'team-gate.json', 'team-live.md', 'team-dashboard.json', 'team-runtime-tasks.json'],
    memory: {
      retrieved: (memorySweep?.operations || []).filter((op) => op.operation === 'NOOP').slice(0, 8),
      forget_queue: (memorySweep?.operations || []).filter((op) => ['DEMOTE', 'SOFT_FORGET', 'ARCHIVE', 'HARD_DELETE', 'CONSOLIDATE'].includes(op.operation)).slice(0, 12)
    },
    skills: {
      injected: skillForge?.injection?.injected || [],
      candidates: skillForge?.candidates || [],
      retirements: skillForge?.retirements || []
    },
    mistakes: {
      relevant: mistakeMemory?.relevant_fingerprints || [],
      recovery_required: Boolean(mistakeMemory?.recovery_required)
    },
    code_structure: {
      risks: codeStructure?.remaining_risks || [],
      files: codeStructure?.files || []
    },
    visual_map: visualMap || null
  };
}

export async function writeTeamDashboardState(dir, opts = {}) {
  const state = await buildTeamDashboardState(dir, opts);
  await writeJsonAtomic(path.join(dir, ARTIFACT_FILES.team_dashboard_state), state);
  return validateTeamDashboardState(state);
}

export function renderTeamDashboardState(state = {}) {
  const lines = [];
  lines.push(`Mission: ${state.mission?.id || 'unknown'} (${state.mission?.route || 'team'})`);
  lines.push(`Effort: ${state.mission?.effort || 'unknown'} | Phase: ${state.mission?.phase || 'unknown'} | Progress: ${state.mission?.progress_pct || 0}%`);
  lines.push(`Next: ${state.mission?.next_action || 'unknown'}`);
  lines.push('');
  for (const pane of state.panes || []) lines.push(`[${pane}]`);
  if (state.memory?.forget_queue?.length) lines.push(`Forget Queue: ${state.memory.forget_queue.length}`);
  if (state.skills?.injected?.length) lines.push(`Skill Autopilot: ${state.skills.injected.length} matched`);
  if (state.mistakes?.recovery_required) lines.push('Mistake Immunity: recovery required');
  if (state.code_structure?.risks?.length) lines.push(`Code Structure Risks: ${state.code_structure.risks.length}`);
  return lines.join('\n');
}

export const TEAM_DASHBOARD_PANES = ['Legacy Team Observation'];

export async function buildTeamDashboardState(_dir: any, opts: any = {}) {
  return {
    schema_version: 1,
    legacy_observe_only: true,
    mission: { id: opts.missionId || 'unknown', route: 'team', phase: 'legacy_observe' },
    panes: TEAM_DASHBOARD_PANES,
    gates: [],
    agents: [],
    tasks: []
  };
}

export async function writeTeamDashboardState(dir: any, opts: any = {}) {
  const { writeJsonAtomic } = await import('./fsx.js');
  const { ARTIFACT_FILES } = await import('./artifact-schemas.js');
  const state = await buildTeamDashboardState(dir, opts);
  await writeJsonAtomic(`${dir}/${ARTIFACT_FILES.team_dashboard_state}`, state);
  return { ok: true, state };
}

export function renderTeamDashboardState(state: any = {}) {
  return `Mission: ${state.mission?.id || 'unknown'} (${state.mission?.route || 'team'})\nPhase: ${state.mission?.phase || 'legacy_observe'}`;
}

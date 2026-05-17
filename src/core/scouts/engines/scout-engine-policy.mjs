import { detectScoutEngines } from './scout-engine-detect.mjs';
import { normalizeScoutEngineName, SCOUT_ENGINE_NAMES } from './scout-engine-base.mjs';

export async function selectScoutEngine(root, {
  requested = 'auto',
  requireRealParallel = false,
  missionId = null,
  route = '$Team',
  mock = false
} = {}) {
  const normalized = normalizeScoutEngineName(requested);
  const report = await detectScoutEngines(root, { missionId, route, mock });
  const byName = new Map(report.engines.map((engine) => [engine.name, engine]));
  const blockers = [];

  let selected = null;
  if (normalized !== 'auto') {
    selected = byName.get(normalized) || {
      name: normalized,
      available: false,
      real_parallel: false,
      status: 'blocked',
      reason: `Unknown scout engine: ${normalized}`,
      blockers: [`unknown_engine:${normalized}`],
      claim_allowed: false
    };
  } else if (mock) {
    selected = byName.get('local-static');
  } else {
    selected = [
      byName.get('codex-app-subagents'),
      byName.get('codex-exec-parallel'),
      byName.get('tmux-lanes'),
      byName.get('local-static'),
      byName.get('sequential-fallback')
    ].find((engine) => engine?.available);
  }

  if (!selected) {
    selected = byName.get('sequential-fallback') || {
      name: 'sequential-fallback',
      available: true,
      real_parallel: false,
      claim_allowed: false,
      reason: 'Last-resort sequential fallback.'
    };
  }

  if (normalized !== 'auto' && !SCOUT_ENGINE_NAMES.includes(normalized)) {
    blockers.push(`unknown_engine:${normalized}`);
  }
  if (normalized !== 'auto' && selected.available !== true) {
    blockers.push(...(selected.blockers || [selected.reason || `${normalized}:not_available`]));
  }
  if (requireRealParallel && selected.real_parallel !== true) {
    blockers.push('real_parallel_engine_required_but_unavailable');
  }
  if (requireRealParallel && selected.real_parallel === true && selected.available !== true) {
    blockers.push(...(selected.blockers || [selected.reason || `${selected.name}:not_available`]));
  }

  return {
    schema: 'sks.scout-engine-selection.v1',
    mission_id: missionId,
    route,
    requested: normalized,
    selected: selected.name,
    engine: selected,
    available: selected.available === true && blockers.length === 0,
    real_parallel: selected.real_parallel === true,
    mock: Boolean(mock),
    require_real_parallel: Boolean(requireRealParallel),
    blockers,
    engines: report.engines
  };
}

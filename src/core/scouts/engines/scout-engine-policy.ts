import { detectScoutEngines } from './scout-engine-detect.js';
import { normalizeScoutEngineName, SCOUT_ENGINE_NAMES } from './scout-engine-base.js';

export async function selectScoutEngine(root: any, {
  requested = 'auto',
  requireRealParallel = false,
  requireOutputSchema = false,
  missionId = null,
  route = '$Team',
  mock = false
}: any = {}) {
  const normalized = normalizeScoutEngineName(requested);
  const report = await detectScoutEngines(root, { missionId, route, mock });
  const byName = new Map(report.engines.map((engine: any) => [engine.name, engine]));
  const blockers: any[] = [];

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
      byName.get('codex-exec-parallel'),
      byName.get('codex-app-subagents'),
      byName.get('tmux-lanes'),
      byName.get('local-static'),
      byName.get('sequential-fallback')
    ].find((engine: any) => engine?.available);
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
  if (requireOutputSchema && selected.supports_output_schema !== true) {
    blockers.push('output_schema_required_but_unavailable');
  }

  return {
    schema: 'sks.scout-engine-selection.v2',
    mission_id: missionId,
    route,
    requested: normalized,
    selected: selected.name,
    engine: selected,
    available: selected.available === true && blockers.length === 0,
    real_parallel: selected.real_parallel === true,
    mock: Boolean(mock),
    require_real_parallel: Boolean(requireRealParallel),
    require_output_schema: Boolean(requireOutputSchema),
    blockers,
    engines: report.engines
  };
}

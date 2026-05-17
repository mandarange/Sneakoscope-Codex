import path from 'node:path';
import { nowIso } from '../../fsx.mjs';
import { SCOUT_COUNT, SCOUT_ROLES } from '../scout-schema.mjs';

export const SCOUT_ENGINE_RESULT_SCHEMA = 'sks.scout-engine-result.v1';

export const SCOUT_ENGINE_NAMES = Object.freeze([
  'codex-exec-parallel',
  'tmux-lanes',
  'codex-app-subagents',
  'local-static',
  'sequential-fallback'
]);

export const REAL_PARALLEL_SCOUT_ENGINES = new Set([
  'codex-exec-parallel',
  'tmux-lanes',
  'codex-app-subagents'
]);

export function normalizeScoutEngineName(value = 'auto') {
  const raw = String(value || 'auto').trim();
  if (!raw || raw === 'auto') return 'auto';
  const normalized = raw.toLowerCase().replace(/_/g, '-');
  if (SCOUT_ENGINE_NAMES.includes(normalized)) return normalized;
  return normalized;
}

export function isRealParallelScoutEngine(engine) {
  return REAL_PARALLEL_SCOUT_ENGINES.has(String(engine || ''));
}

export function scoutEngineResult({
  engine,
  realParallel = isRealParallelScoutEngine(engine),
  mock = false,
  parallelMode = realParallel ? 'parallel' : 'sequential',
  scoutCount = SCOUT_COUNT,
  completedScouts = 0,
  startedAt = nowIso(),
  completedAt = nowIso(),
  durationMs = 0,
  perScoutDurationMs = {},
  claimAllowed = false,
  blockers = [],
  unverified = []
} = {}) {
  return {
    schema: SCOUT_ENGINE_RESULT_SCHEMA,
    engine,
    real_parallel: Boolean(realParallel),
    mock: Boolean(mock),
    parallel_mode: parallelMode,
    scout_count: scoutCount,
    completed_scouts: completedScouts,
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: durationMs,
    per_scout_duration_ms: perScoutDurationMs,
    claim_allowed: Boolean(claimAllowed),
    blockers,
    unverified
  };
}

export function buildScoutPrompt({ missionId, route, task, role, outputPath }) {
  const relOutput = outputPath ? path.normalize(outputPath) : role.json;
  return [
    `You are ${role.role} for SKS Five-Scout read-only intake.`,
    '',
    'Read-only policy:',
    '- Do not modify source files, package files, migrations, generated app assets, git state, or database state.',
    '- Do not install packages or run DB writes.',
    '- Write only the requested scout output path when the runtime supports output redirection.',
    '',
    `Mission id: ${missionId}`,
    `Route: ${route}`,
    `Scout role: ${role.id}`,
    `Output path: ${relOutput}`,
    '',
    'Required JSON-compatible content:',
    '- schema: sks.scout-result.v1',
    '- scout_id, role, route, status, read_only, summary, findings, suggested_tasks',
    '- blockers and unverified arrays when evidence is incomplete',
    '',
    `Task: ${task || 'Inspect the current route context and identify risks, suggested tasks, and verification evidence.'}`
  ].join('\n');
}

export function unavailableEngine(name, reason, extra = {}) {
  return {
    name,
    available: false,
    real_parallel: isRealParallelScoutEngine(name),
    status: 'blocked',
    reason,
    blockers: [reason],
    fallback: extra.fallback || 'local-static',
    claim_allowed: false,
    ...extra
  };
}

export function availableEngine(name, extra = {}) {
  return {
    name,
    available: true,
    real_parallel: isRealParallelScoutEngine(name),
    status: 'available',
    blockers: [],
    claim_allowed: isRealParallelScoutEngine(name),
    ...extra
  };
}

export function emptyScoutDurations(value = 0) {
  return Object.fromEntries(SCOUT_ROLES.map((role) => [role.id, value]));
}

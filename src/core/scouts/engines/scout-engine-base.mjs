import path from 'node:path';
import { nowIso, randomId, sha256 } from '../../fsx.mjs';
import { SCOUT_COUNT, SCOUT_RESULT_SCHEMA, SCOUT_ROLES } from '../scout-schema.mjs';
export const SCOUT_ENGINE_RESULT_SCHEMA = 'sks.scout-engine-result.v2';
export const SCOUT_ENGINE_NAMES = Object.freeze([
    'codex-exec-parallel',
    'fake-codex-exec',
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
    if (!raw || raw === 'auto')
        return 'auto';
    const normalized = raw.toLowerCase().replace(/_/g, '-');
    if (SCOUT_ENGINE_NAMES.includes(normalized))
        return normalized;
    return normalized;
}
export function isRealParallelScoutEngine(engine) {
    return REAL_PARALLEL_SCOUT_ENGINES.has(String(engine || ''));
}
export function createScoutEngineRunId({ engine = 'unknown', timestamp = nowIso(), seed = randomId(8) } = {}) {
    const stamp = String(timestamp).replace(/[^0-9A-Za-z]+/g, '').slice(0, 17) || String(Date.now());
    const cleanEngine = normalizeScoutEngineName(engine).replace(/[^a-z0-9-]+/g, '-');
    const shortHash = sha256(`${timestamp}:${cleanEngine}:${seed}`).slice(0, 8);
    return `scout-run-${stamp}-${cleanEngine}-${shortHash}`;
}
export function scoutBenchmarkNamespace(engineRunId) {
    return `scout-benchmarks/${String(engineRunId || 'unknown')}`;
}
export function scoutEngineMode(engine, { outputSchemaUsed = false } = {}) {
    const normalized = normalizeScoutEngineName(engine);
    if (normalized === 'codex-exec-parallel')
        return outputSchemaUsed ? 'codex_exec_resume_schema' : 'codex_exec';
    if (normalized === 'tmux-lanes')
        return 'tmux_lane';
    if (normalized === 'codex-app-subagents')
        return 'codex_app_subagent';
    if (normalized === 'local-static')
        return 'local_static';
    if (normalized === 'sequential-fallback')
        return 'sequential_fallback';
    if (normalized === 'fake-codex-exec')
        return 'fake_codex_exec';
    return 'unknown';
}
export function scoutEngineResult({ engineRunId = null, engine, realParallel = isRealParallelScoutEngine(engine), mock = false, parallelMode = realParallel ? 'parallel' : 'sequential', artifactNamespace = null, artifactsDir = null, outputSchemaUsed = false, outputSchemaPath = null, codexVersion = null, compatibilityPolicy = null, readOnlyConfirmed = null, scoutCount = SCOUT_COUNT, completedScouts = 0, startedAt = nowIso(), completedAt = nowIso(), durationMs = 0, perScoutDurationMs = {}, claimAllowed = false, blockers = [], unverified = [], jobs = [], sourcePolicy = null } = {}) {
    return {
        schema: SCOUT_ENGINE_RESULT_SCHEMA,
        engine_run_id: engineRunId,
        engine,
        engine_mode: scoutEngineMode(engine, { outputSchemaUsed }),
        real_parallel: Boolean(realParallel),
        mock: Boolean(mock),
        parallel_mode: parallelMode,
        artifact_namespace: artifactNamespace,
        artifacts_dir: artifactsDir,
        output_schema_used: Boolean(outputSchemaUsed),
        output_schema_path: outputSchemaPath,
        codex_version: codexVersion,
        compatibility_policy: compatibilityPolicy,
        read_only_confirmed: readOnlyConfirmed,
        scout_count: scoutCount,
        completed_scouts: completedScouts,
        started_at: startedAt,
        completed_at: completedAt,
        duration_ms: durationMs,
        per_scout_duration_ms: perScoutDurationMs,
        claim_allowed: Boolean(claimAllowed),
        source_policy: sourcePolicy,
        jobs,
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
        '- Do not create or edit the requested output path yourself; the Codex CLI captures your final response there.',
        '- Use only bounded read-only inspection such as rg, sed, git status, npm script listing, and existing artifact reads.',
        '- Do not start SKS routes, Team missions, wiki/wrongness writes, hooks, package installs, or long-running servers.',
        '- Read-only mode is expected and is not a blocker by itself.',
        '',
        `Mission id: ${missionId}`,
        `Route: ${route}`,
        `Scout role: ${role.id}`,
        `Output path: ${relOutput}`,
        '',
        'Required JSON-compatible content:',
        `- schema: ${SCOUT_RESULT_SCHEMA}`,
        '- scout_id, role, route, status, read_only, summary, findings, suggested_tasks',
        '- engine_run_id, scout_session_id, engine, engine_mode, output_schema_used, schema_validation, session_lifecycle',
        '- Use unverified for normal evidence gaps, skipped risky checks, or lower-confidence follow-ups.',
        '- Use blockers only for a real reason this scout intake cannot safely proceed.',
        '- Do not list read-only mode, JSON schema output, or Codex output redirection as blockers.',
        '- If the runtime supplies --output-schema, return only JSON matching the schema.',
        '- Tool calls for read-only inspection are allowed before the final JSON response.',
        '- If inspection is constrained, return status "partial" with unverified items; use status "blocked" only for a real intake blocker.',
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
//# sourceMappingURL=scout-engine-base.js.map

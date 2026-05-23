import path from 'node:path';
import { nowIso, readText } from '../fsx.mjs';
import { SCOUT_RESULT_COMPATIBLE_SCHEMAS, SCOUT_RESULT_SCHEMA } from './scout-schema.mjs';
import { scoutRouteLabel } from './scout-plan.mjs';
import { codexSchemaPath, runCodexExecResumeWithOutputSchema } from '../codex-exec-output-schema.mjs';
export async function parseScoutOutputFile({ outputFile, stdoutFile = null, stderrFile = null, missionId = null, route = '$Team', role, engine = null, realParallel = false, generatedAt = nowIso(), outputSchemaSessionId = null, engineRunId = null, scoutSessionId = null, artifactNamespace = 'canonical', outputSchemaUsed = false, outputSchemaPath = null, engineMode = null } = {}) {
    const outputText = outputFile ? await readText(outputFile, '') : '';
    const stdoutText = stdoutFile ? await readText(stdoutFile, '') : '';
    const stderrText = stderrFile ? await readText(stderrFile, '') : '';
    const source = buildSource({ outputFile, stdoutFile, stderrFile, engine, realParallel, engineRunId, scoutSessionId, artifactNamespace, outputSchemaUsed, outputSchemaPath, engineMode });
    const secretIssues = secretLeakIssues(`${outputText}\n${stdoutText}\n${stderrText}`);
    if (outputSchemaSessionId && outputFile) {
        const schemaPath = await codexSchemaPath('scout-result');
        const structured = await runCodexExecResumeWithOutputSchema({
            sessionId: outputSchemaSessionId,
            prompt: `Parse scout output from ${outputFile} into the scout-result schema.`,
            outputSchemaPath: schemaPath
        });
        if (structured.ok && structured.parsed_json) {
            return normalizeParsedScoutResult(structured.parsed_json, {
                missionId,
                route,
                role,
                engine,
                realParallel,
                source: { ...source, output_schema_run: structured.output_file },
                generatedAt
            });
        }
    }
    let parsed = parseScoutOutputText(outputText);
    if (!parsed.ok && stdoutText)
        parsed = parseScoutOutputText(stdoutText);
    if (!parsed.ok) {
        return blockedScoutResult({
            missionId,
            route,
            role,
            engine,
            realParallel,
            source,
            generatedAt,
            reason: parsed.error || 'no_parseable_json_object'
        });
    }
    const result = normalizeParsedScoutResult(parsed.value, {
        missionId,
        route,
        role,
        engine,
        realParallel,
        source,
        generatedAt
    });
    if (secretIssues.length) {
        result.status = 'blocked';
        result.schema_validation = { ...(result.schema_validation || {}), ok: false, issues: [...(result.schema_validation?.issues || []), ...secretIssues] };
        result.blockers = [...new Set([...(result.blockers || []), ...secretIssues])];
        result.parse_issues = [...new Set([...(result.parse_issues || []), ...secretIssues])];
    }
    return result;
}
export function parseScoutOutput(text, ctx = {}) {
    const parsed = parseScoutOutputText(text);
    if (!parsed.ok) {
        return blockedScoutResult({
            missionId: ctx.missionId,
            route: ctx.route,
            role: ctx.role,
            engine: ctx.engine,
            realParallel: ctx.realParallel,
            source: buildSource({
                outputFile: ctx.sourceFile,
                stdoutFile: null,
                stderrFile: null,
                engine: ctx.engine,
                realParallel: ctx.realParallel
            }),
            generatedAt: ctx.generatedAt || nowIso(),
            reason: parsed.error || 'invalid_json'
        });
    }
    return normalizeParsedScoutResult(parsed.value, ctx);
}
export function parseScoutOutputText(text = '') {
    const raw = String(text || '').trim();
    if (!raw)
        return { ok: false, error: 'empty_output' };
    const candidates = [
        ...jsonFenceCandidates(raw),
        raw,
        ...balancedJsonObjectCandidates(raw)
    ];
    const seen = new Set();
    for (const candidate of candidates) {
        const body = String(candidate || '').trim();
        if (!body || seen.has(body))
            continue;
        seen.add(body);
        try {
            const value = JSON.parse(body);
            if (value && typeof value === 'object' && !Array.isArray(value))
                return { ok: true, value };
        }
        catch { }
    }
    return { ok: false, error: 'invalid_json' };
}
export function normalizeParsedScoutResult(raw = {}, { missionId = null, route = '$Team', role, engine = null, realParallel = false, source = {}, engineRunId = source.engine_run_id || null, scoutSessionId = source.scout_session_id || null, artifactNamespace = source.artifact_namespace || 'canonical', outputSchemaUsed = source.output_schema_used === true, outputSchemaPath = source.output_schema_path || null, generatedAt = nowIso() } = {}) {
    const blockers = arrayOfStrings(raw.blockers);
    const validationBlockers = [];
    const schemaCompatible = SCOUT_RESULT_COMPATIBLE_SCHEMAS.includes(raw.schema);
    if (!schemaCompatible)
        validationBlockers.push(`invalid_schema:${raw.schema || 'missing'}`);
    if (raw.scout_id && raw.scout_id !== role.id)
        validationBlockers.push(`scout_id_mismatch:${raw.scout_id}`);
    if (raw.read_only !== true)
        validationBlockers.push('read_only_not_confirmed');
    if (!String(raw.summary || '').trim())
        validationBlockers.push('summary_missing');
    const status = validationBlockers.length || blockers.length || raw.status === 'blocked' ? 'blocked' : 'done';
    const result = {
        schema: SCOUT_RESULT_SCHEMA,
        mission_id: raw.mission_id || missionId,
        scout_id: role.id,
        role: raw.role || role.role,
        route: scoutRouteLabel(raw.route || route),
        status,
        read_only: raw.read_only === true,
        write_policy: raw.write_policy || 'read_only',
        generated_at: raw.generated_at || generatedAt,
        summary: String(raw.summary || '').trim(),
        findings: normalizeFindings(raw.findings),
        suggested_tasks: normalizeTasks(raw.suggested_tasks),
        context7_required: raw.context7_required === true,
        context7_libraries: arrayOfStrings(raw.context7_libraries),
        required_image_voxel_evidence: arrayOfStrings(raw.required_image_voxel_evidence),
        engine: raw.engine || engine,
        engine_run_id: raw.engine_run_id || engineRunId,
        scout_session_id: raw.scout_session_id || scoutSessionId || `${engineRunId || raw.mission_id || missionId || 'scout-run'}-${role.id}`,
        engine_mode: raw.engine_mode || source.engine_mode || null,
        real_parallel: Boolean(raw.real_parallel ?? realParallel),
        output_schema_used: Boolean(raw.output_schema_used ?? outputSchemaUsed),
        output_schema_path: raw.output_schema_path || outputSchemaPath,
        schema_validation: raw.schema_validation || { ok: true, schema: SCOUT_RESULT_SCHEMA, migrated_from_schema: raw.schema === SCOUT_RESULT_SCHEMA ? null : raw.schema || null, issues: [] },
        session_lifecycle: raw.session_lifecycle || {
            status: status === 'blocked' ? 'blocked' : 'completed',
            started_at: source.started_at || generatedAt,
            completed_at: source.completed_at || generatedAt,
            timeout: source.timed_out === true,
            session_id: raw.session_id || scoutSessionId || null,
            resume_id: raw.resume_id || source.resume_id || null,
            lane_id: source.lane_id || null
        },
        source: 'real_engine_output',
        source_file: source.output_file || null,
        stdout_file: source.stdout_file || null,
        stderr_file: source.stderr_file || null,
        read_only_confirmed: raw.read_only_confirmed ?? raw.read_only === true,
        artifact_namespace: raw.artifact_namespace || artifactNamespace,
        parsed: true,
        parse_issues: [],
        source_policy: 'parsed_scout_output',
        source_details: source,
        blockers: [...blockers, ...validationBlockers],
        unverified: arrayOfStrings(raw.unverified)
    };
    if (result.status === 'blocked')
        result.blocked_reason = result.blockers?.[0] || 'blocked';
    const validation = validateScoutResult(result);
    if (!validation.ok) {
        result.status = 'blocked';
        result.blockers = [...new Set([...(result.blockers || []), ...validation.blockers])];
        result.parse_issues = validation.blockers;
        result.blocked_reason = result.blockers?.[0] || 'schema_validation_failed';
    }
    return result;
}
export const normalizeScoutResult = normalizeParsedScoutResult;
export function validateScoutResult(result = {}, { requireFindings = true, requireSuggestedTasks = true, requireReadOnly = true } = {}) {
    const blockers = [];
    if (result.schema !== SCOUT_RESULT_SCHEMA)
        blockers.push(`invalid_schema:${result.schema || 'missing'}`);
    if (!String(result.scout_id || '').trim())
        blockers.push('scout_id_missing');
    if (!String(result.role || '').trim())
        blockers.push('role_missing');
    if (!String(result.summary || '').trim())
        blockers.push('summary_missing');
    if (!Array.isArray(result.findings))
        blockers.push('findings_not_array');
    if (!Array.isArray(result.suggested_tasks))
        blockers.push('suggested_tasks_not_array');
    if (requireFindings && !result.findings?.length)
        blockers.push('findings_missing');
    if (requireSuggestedTasks && !result.suggested_tasks?.length)
        blockers.push('suggested_tasks_missing');
    if (requireReadOnly && result.read_only !== true)
        blockers.push('read_only_not_confirmed');
    return { ok: blockers.length === 0, blockers };
}
function blockedScoutResult({ missionId, route, role, engine, realParallel, source, generatedAt, reason }) {
    return {
        schema: SCOUT_RESULT_SCHEMA,
        mission_id: missionId,
        scout_id: role.id,
        role: role.role,
        route: scoutRouteLabel(route),
        status: 'blocked',
        read_only: true,
        write_policy: 'read_only',
        generated_at: generatedAt,
        summary: `Scout output could not be parsed into ${SCOUT_RESULT_SCHEMA}.`,
        findings: [],
        suggested_tasks: [],
        context7_required: false,
        context7_libraries: [],
        required_image_voxel_evidence: [],
        engine,
        engine_run_id: source.engine_run_id || null,
        scout_session_id: source.scout_session_id || `${source.engine_run_id || missionId || 'scout-run'}-${role.id}`,
        engine_mode: source.engine_mode || null,
        real_parallel: Boolean(realParallel),
        output_schema_used: source.output_schema_used === true,
        output_schema_path: source.output_schema_path || null,
        schema_validation: { ok: false, schema: SCOUT_RESULT_SCHEMA, issues: [`scout_output_parse_failed:${reason}`] },
        session_lifecycle: {
            status: 'blocked',
            started_at: source.started_at || generatedAt,
            completed_at: source.completed_at || generatedAt,
            timeout: source.timed_out === true,
            session_id: source.scout_session_id || null,
            resume_id: source.resume_id || null,
            lane_id: source.lane_id || null
        },
        source: 'real_engine_output',
        source_file: source.output_file || null,
        stdout_file: source.stdout_file || null,
        stderr_file: source.stderr_file || null,
        read_only_confirmed: true,
        artifact_namespace: source.artifact_namespace || 'canonical',
        parsed: false,
        parse_issues: [`scout_output_parse_failed:${reason}`],
        blocked_reason: `scout_output_parse_failed:${reason}`,
        source_policy: 'parse_failed_blocked',
        source_details: source,
        blockers: [`scout_output_parse_failed:${reason}`],
        unverified: ['Real scout output was unavailable or invalid; no static substitute was accepted.']
    };
}
function secretLeakIssues(text) {
    const raw = String(text || '');
    const issues = [];
    if (/sk-[A-Za-z0-9_-]{16,}/.test(raw))
        issues.push('secret_leak:openai_key');
    if (/github_pat_[A-Za-z0-9_]+/.test(raw))
        issues.push('secret_leak:github_pat');
    if (/-----BEGIN (?:RSA |OPENSSH |EC |DSA )?PRIVATE KEY-----/.test(raw))
        issues.push('secret_leak:private_key');
    return issues;
}
function buildSource({ outputFile, stdoutFile, stderrFile, engine, realParallel, engineRunId = null, scoutSessionId = null, artifactNamespace = 'canonical', outputSchemaUsed = false, outputSchemaPath = null, engineMode = null }) {
    return {
        type: 'engine_output',
        engine: engine || null,
        engine_run_id: engineRunId,
        scout_session_id: scoutSessionId,
        artifact_namespace: artifactNamespace,
        engine_mode: engineMode,
        real_parallel: Boolean(realParallel),
        output_schema_used: Boolean(outputSchemaUsed),
        output_schema_path: outputSchemaPath,
        output_file: normalizePath(outputFile),
        stdout_file: normalizePath(stdoutFile),
        stderr_file: normalizePath(stderrFile)
    };
}
function normalizePath(file) {
    return file ? path.normalize(file) : null;
}
function jsonFenceCandidates(text) {
    const out = [];
    const re = /```(?:json)?\s*([\s\S]*?)```/gi;
    let match;
    while ((match = re.exec(text)))
        out.push(match[1]);
    return out;
}
function balancedJsonObjectCandidates(text) {
    const out = [];
    for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
        let depth = 0;
        let inString = false;
        let escaped = false;
        for (let i = start; i < text.length; i += 1) {
            const ch = text[i];
            if (inString) {
                if (escaped)
                    escaped = false;
                else if (ch === '\\')
                    escaped = true;
                else if (ch === '"')
                    inString = false;
                continue;
            }
            if (ch === '"')
                inString = true;
            else if (ch === '{')
                depth += 1;
            else if (ch === '}') {
                depth -= 1;
                if (depth === 0) {
                    out.push(text.slice(start, i + 1));
                    break;
                }
            }
        }
    }
    return out;
}
function normalizeFindings(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map((item, index) => ({
        id: String(item.id || `finding-${index + 1}`),
        kind: String(item.kind || 'finding'),
        claim: String(item.claim || item.summary || ''),
        evidence: Array.isArray(item.evidence) ? item.evidence : [],
        risk: String(item.risk || 'medium'),
        action: item.action ? String(item.action) : undefined
    })).filter((item) => item.claim) : [];
}
function normalizeTasks(value) {
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object').map((item, index) => ({
        id: String(item.id || `task-${index + 1}`),
        title: String(item.title || item.summary || 'Scout suggested task'),
        owner_type: String(item.owner_type || 'implementation'),
        files: arrayOfStrings(item.files),
        verification: arrayOfStrings(item.verification),
        risk: item.risk ? String(item.risk) : undefined
    })) : [];
}
function arrayOfStrings(value) {
    return Array.isArray(value) ? value.map((item) => String(item)).filter(Boolean) : [];
}
//# sourceMappingURL=scout-output-parser.js.map
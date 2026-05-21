import path from 'node:path';
import { nowIso, readText } from '../fsx.js';
import { SCOUT_RESULT_SCHEMA } from './scout-schema.js';
import { scoutRouteLabel } from './scout-plan.js';
import { codexSchemaPath, runCodexExecResumeWithOutputSchema } from '../codex-exec-output-schema.js';

export async function parseScoutOutputFile({
  outputFile,
  stdoutFile = null,
  stderrFile = null,
  missionId = null,
  route = '$Team',
  role,
  engine = null,
  realParallel = false,
  generatedAt = nowIso(),
  outputSchemaSessionId = null
}: any = {}) {
  const outputText = outputFile ? await readText(outputFile, '') : '';
  const stdoutText = stdoutFile ? await readText(stdoutFile, '') : '';
  const source = buildSource({ outputFile, stdoutFile, stderrFile, engine, realParallel });
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
  if (!parsed.ok && stdoutText) parsed = parseScoutOutputText(stdoutText);
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
  return normalizeParsedScoutResult(parsed.value, {
    missionId,
    route,
    role,
    engine,
    realParallel,
    source,
    generatedAt
  });
}

export function parseScoutOutput(text: any, ctx: any = {}) {
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

export function parseScoutOutputText(text: any = '') {
  const raw = String(text || '').trim();
  if (!raw) return { ok: false, error: 'empty_output' };
  const candidates = [
    ...jsonFenceCandidates(raw),
    raw,
    ...balancedJsonObjectCandidates(raw)
  ];
  const seen = new Set();
  for (const candidate of candidates) {
    const body = String(candidate || '').trim();
    if (!body || seen.has(body)) continue;
    seen.add(body);
    try {
      const value = JSON.parse(body);
      if (value && typeof value === 'object' && !Array.isArray(value)) return { ok: true, value };
    } catch {}
  }
  return { ok: false, error: 'invalid_json' };
}

export function normalizeParsedScoutResult(raw: any = {}, {
  missionId = null,
  route = '$Team',
  role,
  engine = null,
  realParallel = false,
  source = {},
  generatedAt = nowIso()
}: any = {}) {
  const blockers = arrayOfStrings(raw.blockers);
  const validationBlockers: any[] = [];
  if (raw.schema !== SCOUT_RESULT_SCHEMA) validationBlockers.push(`invalid_schema:${raw.schema || 'missing'}`);
  if (raw.scout_id && raw.scout_id !== role.id) validationBlockers.push(`scout_id_mismatch:${raw.scout_id}`);
  if (raw.read_only !== true) validationBlockers.push('read_only_not_confirmed');
  if (!String(raw.summary || '').trim()) validationBlockers.push('summary_missing');
  const status = validationBlockers.length || blockers.length || raw.status === 'blocked' ? 'blocked' : 'done';
  const result: any = {
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
    real_parallel: Boolean(raw.real_parallel ?? realParallel),
    source: 'real_engine_output',
    source_file: source.output_file || null,
    parsed: true,
    parse_issues: [],
    source_policy: 'parsed_scout_output',
    source_details: source,
    blockers: [...blockers, ...validationBlockers],
    unverified: arrayOfStrings(raw.unverified)
  };
  const validation = validateScoutResult(result);
  if (!validation.ok) {
    result.status = 'blocked';
    result.blockers = [...new Set([...(result.blockers || []), ...validation.blockers])] as any[];
    result.parse_issues = validation.blockers;
  }
  return result;
}

export const normalizeScoutResult = normalizeParsedScoutResult;

export function validateScoutResult(result: any = {}, {
  requireFindings = true,
  requireSuggestedTasks = true,
  requireReadOnly = true
}: any = {}) {
  const blockers: any[] = [];
  if (result.schema !== SCOUT_RESULT_SCHEMA) blockers.push(`invalid_schema:${result.schema || 'missing'}`);
  if (!String(result.scout_id || '').trim()) blockers.push('scout_id_missing');
  if (!String(result.role || '').trim()) blockers.push('role_missing');
  if (!String(result.summary || '').trim()) blockers.push('summary_missing');
  if (!Array.isArray(result.findings)) blockers.push('findings_not_array');
  if (!Array.isArray(result.suggested_tasks)) blockers.push('suggested_tasks_not_array');
  if (requireFindings && !result.findings?.length) blockers.push('findings_missing');
  if (requireSuggestedTasks && !result.suggested_tasks?.length) blockers.push('suggested_tasks_missing');
  if (requireReadOnly && result.read_only !== true) blockers.push('read_only_not_confirmed');
  return { ok: blockers.length === 0, blockers };
}

function blockedScoutResult({ missionId, route, role, engine, realParallel, source, generatedAt, reason }: any) {
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
    summary: 'Scout output could not be parsed into sks.scout-result.v1.',
    findings: [],
    suggested_tasks: [],
    context7_required: false,
    context7_libraries: [],
    required_image_voxel_evidence: [],
    engine,
    real_parallel: Boolean(realParallel),
    source: 'real_engine_output',
    source_file: source.output_file || null,
    parsed: false,
    parse_issues: [`scout_output_parse_failed:${reason}`],
    source_policy: 'parse_failed_blocked',
    source_details: source,
    blockers: [`scout_output_parse_failed:${reason}`],
    unverified: ['Real scout output was unavailable or invalid; no static substitute was accepted.']
  };
}

function buildSource({ outputFile, stdoutFile, stderrFile, engine, realParallel }: any) {
  return {
    type: 'engine_output',
    engine: engine || null,
    real_parallel: Boolean(realParallel),
    output_file: normalizePath(outputFile),
    stdout_file: normalizePath(stdoutFile),
    stderr_file: normalizePath(stderrFile)
  };
}

function normalizePath(file: any) {
  return file ? path.normalize(file) : null;
}

function jsonFenceCandidates(text: any) {
  const out: any[] = [];
  const re = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match;
  while ((match = re.exec(text))) out.push(match[1]);
  return out;
}

function balancedJsonObjectCandidates(text: any) {
  const out: any[] = [];
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth += 1;
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

function normalizeFindings(value: any) {
  return Array.isArray(value) ? value.filter((item: any) => item && typeof item === 'object').map((item: any, index: any) => ({
    id: String(item.id || `finding-${index + 1}`),
    kind: String(item.kind || 'finding'),
    claim: String(item.claim || item.summary || ''),
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    risk: String(item.risk || 'medium'),
    action: item.action ? String(item.action) : undefined
  })).filter((item: any) => item.claim) : [];
}

function normalizeTasks(value: any) {
  return Array.isArray(value) ? value.filter((item: any) => item && typeof item === 'object').map((item: any, index: any) => ({
    id: String(item.id || `task-${index + 1}`),
    title: String(item.title || item.summary || 'Scout suggested task'),
    owner_type: String(item.owner_type || 'implementation'),
    files: arrayOfStrings(item.files),
    verification: arrayOfStrings(item.verification),
    risk: item.risk ? String(item.risk) : undefined
  })) : [];
}

function arrayOfStrings(value: any) {
  return Array.isArray(value) ? value.map((item: any) => String(item)).filter(Boolean) : [];
}

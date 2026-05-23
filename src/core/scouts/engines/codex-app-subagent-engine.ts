import path from 'node:path';
import { nowIso, readJson, runProcess } from '../../fsx.js';
import { buildScoutPrompt, scoutEngineMode } from './scout-engine-base.js';

export const CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA = 'sks.codex-app-subagents-capability.v2';
export const CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA_V1 = 'sks.codex-app-subagents-capability.v1';

export async function readCodexAppSubagentCapability(file: any = process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE) {
  if (!file) return { available: false, blockers: ['codex_app_subagents_capability_file_missing'] };
  const descriptor = await readJson(file, null);
  const blockers = validateCodexAppSubagentCapability(descriptor).blockers;
  return {
    available: blockers.length === 0 && descriptor.available === true,
    degraded_supported: descriptor?.schema === CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA_V1,
    descriptor,
    file,
    blockers
  };
}

export function validateCodexAppSubagentCapability(descriptor: any = null) {
  const blockers: any[] = [];
  if (!descriptor || typeof descriptor !== 'object') blockers.push('capability_descriptor_missing');
  if (![CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA, CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA_V1].includes(descriptor?.schema)) blockers.push('capability_schema_invalid');
  if (descriptor?.available !== true) blockers.push('capability_not_available');
  if (!Array.isArray(descriptor?.launch_command) || !descriptor.launch_command.length) blockers.push('launch_command_missing');
  if (descriptor?.supports_output_files !== true) blockers.push('supports_output_files_required');
  if (descriptor?.schema === CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA && descriptor?.supports_parallel_subagents !== true) blockers.push('supports_parallel_subagents_required');
  return { ok: blockers.length === 0, blockers };
}

export async function runCodexAppSubagentEngine(root: any, { missionId, dir, engineRunId = null, artifactNamespace = 'canonical', route, task, roles }: any = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const capability = await readCodexAppSubagentCapability();
  const jobs = roles.map((role: any) => ({
    scout_id: role.id,
    scout_session_id: `${engineRunId || missionId || 'scout-run'}-${role.id}`,
    output_file: path.join(dir, `${role.id}.${engineRunId || 'codex-app'}.codex-app.json`),
    stdout_file: path.join(dir, `${role.id}.${engineRunId || 'codex-app'}.codex-app.stdout.log`),
    stderr_file: path.join(dir, `${role.id}.${engineRunId || 'codex-app'}.codex-app.stderr.log`),
    output_schema_used: capability.descriptor?.supports_output_schema === true,
    output_schema_path: capability.descriptor?.output_schema_path || null,
    engine_mode: scoutEngineMode('codex-app-subagents')
  }));
  if (!capability.available) {
    return {
      engine: 'codex-app-subagents',
      engine_run_id: engineRunId,
      artifact_namespace: artifactNamespace,
      engine_mode: scoutEngineMode('codex-app-subagents'),
      started_at: startedAt,
      completed_at: nowIso(),
      duration_ms: Date.now() - startMs,
      blockers: capability.blockers,
      jobs: jobs.map((job: any) => ({ ...job, status: 'rejected', code: 127, reason: capability.blockers.join('; ') }))
    };
  }
  const [cmd, ...baseArgs] = capability.descriptor.launch_command;
  const runJobs = await Promise.allSettled(roles.map(async (role: any, index: any) => {
    const job = jobs[index];
    const prompt = buildScoutPrompt({ missionId, route, task, role, outputPath: job.output_file });
    const result = await runProcess(cmd, [...baseArgs, '--output-file', job.output_file, '--role', role.id, '--mission-id', missionId, prompt], {
      cwd: root,
      timeoutMs: Number(process.env.SKS_CODEX_APP_SUBAGENT_TIMEOUT_MS || 120000),
      maxOutputBytes: 256 * 1024,
      stdoutFile: job.stdout_file,
      stderrFile: job.stderr_file
    });
    return { ...job, status: result.code === 0 ? 'fulfilled' : 'rejected', code: result.code, reason: result.code === 0 ? null : String(result.stderr || result.stdout || 'launch_failed').slice(-400) };
  }));
  return {
    engine: 'codex-app-subagents',
    engine_run_id: engineRunId,
    artifact_namespace: artifactNamespace,
    engine_mode: scoutEngineMode('codex-app-subagents'),
    started_at: startedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - startMs,
    capability_file: capability.file,
    jobs: runJobs.map((entry: any) => entry.status === 'fulfilled' ? entry.value : { status: 'rejected', reason: entry.reason?.message || String(entry.reason) })
  };
}

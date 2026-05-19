import path from 'node:path';
import { nowIso, readJson, runProcess } from '../../fsx.js';
import { buildScoutPrompt } from './scout-engine-base.js';

export const CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA = 'sks.codex-app-subagents-capability.v1';

export async function readCodexAppSubagentCapability(file: any = process.env.SKS_CODEX_APP_SUBAGENTS_CAPABILITY_FILE) {
  if (!file) return { available: false, blockers: ['codex_app_subagents_capability_file_missing'] };
  const descriptor = await readJson(file, null);
  const blockers = validateCodexAppSubagentCapability(descriptor).blockers;
  return {
    available: blockers.length === 0 && descriptor.available === true,
    descriptor,
    file,
    blockers
  };
}

export function validateCodexAppSubagentCapability(descriptor: any = null) {
  const blockers: any[] = [];
  if (!descriptor || typeof descriptor !== 'object') blockers.push('capability_descriptor_missing');
  if (descriptor?.schema !== CODEX_APP_SUBAGENT_CAPABILITY_SCHEMA) blockers.push('capability_schema_invalid');
  if (descriptor?.available !== true) blockers.push('capability_not_available');
  if (!Array.isArray(descriptor?.launch_command) || !descriptor.launch_command.length) blockers.push('launch_command_missing');
  if (descriptor?.supports_output_files !== true) blockers.push('supports_output_files_required');
  return { ok: blockers.length === 0, blockers };
}

export async function runCodexAppSubagentEngine(root: any, { missionId, dir, route, task, roles }: any = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const capability = await readCodexAppSubagentCapability();
  const jobs = roles.map((role: any) => ({
    scout_id: role.id,
    output_file: path.join(dir, `${role.id}.codex-app.md`),
    stdout_file: path.join(dir, `${role.id}.codex-app.stdout.log`),
    stderr_file: path.join(dir, `${role.id}.codex-app.stderr.log`)
  }));
  if (!capability.available) {
    return {
      engine: 'codex-app-subagents',
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
    started_at: startedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - startMs,
    capability_file: capability.file,
    jobs: runJobs.map((entry: any) => entry.status === 'fulfilled' ? entry.value : { status: 'rejected', reason: entry.reason?.message || String(entry.reason) })
  };
}

import path from 'node:path';
import { runCodexExec } from '../../codex-adapter.js';
import { nowIso } from '../../fsx.js';
import { appendScoutLedger } from '../scout-artifacts.js';
import { buildScoutPrompt } from './scout-engine-base.js';

export async function runCodexExecParallelEngine(root: any, {
  missionId,
  dir,
  route,
  task,
  roles,
  timeoutMs = Number(process.env.SKS_SCOUT_TIMEOUT_MS || 120000)
}: any = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const jobs = roles.map(async (role: any) => {
    const outputFile = path.join(dir, `${role.id}.codex.md`);
    const stdoutFile = path.join(dir, `${role.id}.stdout.log`);
    const stderrFile = path.join(dir, `${role.id}.stderr.log`);
    const prompt = buildScoutPrompt({ missionId, route, task, role, outputPath: outputFile });
    const result = await runCodexExec({
      root,
      prompt,
      outputFile,
      json: true,
      profile: process.env.SKS_SCOUT_CODEX_PROFILE || 'sks-scout-readonly',
      timeoutMs,
      maxBufferBytes: Number(process.env.SKS_SCOUT_MAX_OUTPUT_BYTES || 256 * 1024),
      stdoutFile,
      stderrFile
    });
    await appendScoutLedger(root, missionId, {
      type: 'scout.codex_exec.finished',
      scout_id: role.id,
      code: result.code,
      timed_out: result.timedOut === true,
      output_file: outputFile,
      stdout_file: stdoutFile,
      stderr_file: stderrFile,
      stdout_bytes: result.stdoutBytes,
      stderr_bytes: result.stderrBytes
    });
    return { role, result, outputFile, stdoutFile, stderrFile, durationMs: Date.now() - startMs };
  });
  const settled = await Promise.allSettled(jobs);
  const completedAt = nowIso();
  return {
    engine: 'codex-exec-parallel',
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.now() - startMs,
    jobs: settled.map((entry: any) => entry.status === 'fulfilled'
      ? {
          status: 'fulfilled',
          scout_id: entry.value.role.id,
          code: entry.value.result.code,
          timed_out: entry.value.result.timedOut === true,
          output_file: entry.value.outputFile,
          stdout_file: entry.value.stdoutFile,
          stderr_file: entry.value.stderrFile,
          duration_ms: entry.value.durationMs
        }
      : { status: 'rejected', reason: entry.reason?.message || String(entry.reason) })
  };
}

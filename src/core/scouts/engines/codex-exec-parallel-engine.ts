import path from 'node:path';
import { runCodexExec } from '../../codex-adapter.js';
import { nowIso } from '../../fsx.js';
import { codexSchemaPath, detectCodexExecOutputSchemaSyntax } from '../../codex-exec-output-schema.js';
import { appendScoutLedger } from '../scout-artifacts.js';
import { buildScoutPrompt, scoutEngineMode } from './scout-engine-base.js';

export async function runCodexExecParallelEngine(root: any, {
  missionId,
  dir,
  engineRunId = null,
  artifactNamespace = 'canonical',
  route,
  task,
  roles,
  timeoutMs = Number(process.env.SKS_SCOUT_TIMEOUT_MS || 120000)
}: any = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const outputSchemaPath = await codexSchemaPath('scout-result').catch(() => null);
  const availability = await detectCodexExecOutputSchemaSyntax().catch(() => null);
  const outputSchemaUsed = Boolean(outputSchemaPath && availability?.exec?.output_schema_supported);
  const jobs = roles.map(async (role: any) => {
    const scoutSessionId = `${engineRunId || missionId || 'scout-run'}-${role.id}`;
    const outputFile = path.join(dir, `${role.id}.${engineRunId || 'codex'}.codex.json`);
    const stdoutFile = path.join(dir, `${role.id}.${engineRunId || 'codex'}.stdout.log`);
    const stderrFile = path.join(dir, `${role.id}.${engineRunId || 'codex'}.stderr.log`);
    const prompt = buildScoutPrompt({ missionId, route, task, role, outputPath: outputFile });
    const scoutProfile = process.env.SKS_SCOUT_CODEX_PROFILE || null;
    const result = await runCodexExec({
      root,
      prompt,
      outputFile,
      json: true,
      profile: scoutProfile,
      extraArgs: [
        '--sandbox',
        'read-only',
        '--ignore-rules',
        '--ignore-user-config',
        '--disable',
        'hooks',
        '--disable',
        'plugins',
        '--disable',
        'apps',
        ...(outputSchemaUsed ? ['--output-schema', outputSchemaPath] : [])
      ],
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
      output_schema_used: outputSchemaUsed,
      output_schema_path: outputSchemaPath,
      scout_session_id: scoutSessionId,
      session_id: extractCodexSessionId(result.stdout) || scoutSessionId,
      resume_id: extractCodexSessionId(result.stdout) || null,
      stdout_bytes: result.stdoutBytes,
      stderr_bytes: result.stderrBytes
    });
    return { role, result, outputFile, stdoutFile, stderrFile, outputSchemaUsed, outputSchemaPath, scoutSessionId, durationMs: Date.now() - startMs };
  });
  const settled = await Promise.allSettled(jobs);
  const completedAt = nowIso();
  return {
    engine: 'codex-exec-parallel',
    engine_run_id: engineRunId,
    artifact_namespace: artifactNamespace,
    engine_mode: scoutEngineMode('codex-exec-parallel', { outputSchemaUsed }),
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.now() - startMs,
    jobs: settled.map((entry: any) => entry.status === 'fulfilled'
      ? {
          status: 'fulfilled',
          scout_id: entry.value.role.id,
          scout_session_id: entry.value.scoutSessionId,
          session_id: extractCodexSessionId(entry.value.result.stdout) || entry.value.scoutSessionId,
          resume_id: extractCodexSessionId(entry.value.result.stdout) || null,
          output_schema_used: entry.value.outputSchemaUsed,
          output_schema_path: entry.value.outputSchemaPath,
          output_last_message_path: entry.value.outputFile,
          schema_validation: { ok: entry.value.result.code === 0, issues: entry.value.result.code === 0 ? [] : [`exit_code:${entry.value.result.code}`] },
          engine_mode: scoutEngineMode('codex-exec-parallel', { outputSchemaUsed: entry.value.outputSchemaUsed }),
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

function extractCodexSessionId(stdout: any) {
  for (const line of String(stdout || '').split(/\r?\n/)) {
    try {
      const event = JSON.parse(line);
      const id = event.session_id || event.sessionId || event.thread_id || event.threadId || event.id;
      if (typeof id === 'string' && id.length > 6) return id;
    } catch {}
  }
  return null;
}

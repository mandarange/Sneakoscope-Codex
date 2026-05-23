import path from 'node:path';
import { buildCodexExecArgs, findCodexBinary } from '../../codex-adapter.js';
import { nowIso, runProcess, which } from '../../fsx.js';
import { appendScoutLedger } from '../scout-artifacts.js';
import { buildScoutPrompt } from './scout-engine-base.js';
import { cleanupTmuxScoutSession } from './tmux-lane-cleanup.js';
import { watchTmuxScoutOutputs } from './tmux-lane-watcher.js';

export async function runTmuxLaneEngine(root: any, {
  missionId,
  dir,
  engineRunId = null,
  sessionPrefix = null,
  artifactNamespace = 'canonical',
  route,
  task,
  roles,
  attach = false,
  keepTmux = false,
  timeoutMs = Number(process.env.SKS_SCOUT_TMUX_TIMEOUT_MS || 120000)
}: any = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const tmux = await which('tmux');
  const codex = await findCodexBinary();
  const session = `sks-scouts-${String(sessionPrefix || missionId || 'manual').replace(/[^A-Za-z0-9_-]/g, '-')}`.slice(0, 80);
  const jobs = roles.map((role: any) => ({
    scout_id: role.id,
    scout_session_id: `${sessionPrefix || engineRunId || missionId || 'scout-run'}-${role.id}`,
    lane_id: `${role.index}-${role.kind || role.id}`,
    session,
    socket_name: session,
    output_file: path.join(dir, `${role.id}.${engineRunId || 'tmux'}.tmux.json`),
    stdout_file: path.join(dir, `${role.id}.${engineRunId || 'tmux'}.tmux.stdout.log`),
    stderr_file: path.join(dir, `${role.id}.${engineRunId || 'tmux'}.tmux.stderr.log`)
  }));
  if (!tmux || !codex) {
    return blockedResult({ startedAt, startMs, jobs, blockers: [!tmux ? 'tmux binary not available on PATH.' : 'Codex CLI not available for tmux lane execution.'] });
  }

  await runProcess(tmux, ['kill-session', '-t', session], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => {});
  const created = await runProcess(tmux, ['new-session', '-d', '-s', session, '-c', root, '-n', 'overview'], { timeoutMs: 10000, maxOutputBytes: 8192 });
  if (created.code !== 0) return blockedResult({ startedAt, startMs, jobs, blockers: [`tmux_session_create_failed:${created.stderr || created.stdout}`] });

  for (const [index, role] of roles.entries()) {
    const job = jobs[index];
    const window = `${role.index}-${role.kind || role.id}`;
    await runProcess(tmux, ['new-window', '-t', session, '-n', window, '-c', root], { timeoutMs: 10000, maxOutputBytes: 8192 });
    const prompt = buildScoutPrompt({ missionId, route, task, role, outputPath: job.output_file });
    const args = buildCodexExecArgs({
      root,
      prompt,
      outputFile: job.output_file,
      json: true,
      profile: process.env.SKS_SCOUT_CODEX_PROFILE || null,
      extraArgs: ['--sandbox', 'read-only', '--ignore-rules', '--ignore-user-config', '--disable', 'hooks', '--disable', 'plugins', '--disable', 'apps']
    });
    const command = `${shellQuote(codex)} ${args.map(shellQuote).join(' ')} > ${shellQuote(job.stdout_file)} 2> ${shellQuote(job.stderr_file)}`;
    job.command = command;
    job.window = window;
    job.pane_id = `${session}:${window}.0`;
    job.started_at = nowIso();
    job.engine_run_id = engineRunId;
    job.artifact_namespace = artifactNamespace;
    job.engine_mode = 'tmux_lane';
    job.output_schema_used = false;
    job.output_schema_path = null;
    await runProcess(tmux, ['send-keys', '-t', `${session}:${window}`, command, 'C-m'], { timeoutMs: 10000, maxOutputBytes: 8192 });
    await appendScoutLedger(root, missionId, { type: 'scout.tmux_lane.started', scout_id: role.id, scout_session_id: job.scout_session_id, session, socket_name: session, window, pane_id: job.pane_id, command, output_file: job.output_file, stdout_file: job.stdout_file, stderr_file: job.stderr_file });
  }
  if (attach) await runProcess(tmux, ['display-message', '-t', session, `SKS scouts running in ${session}`], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => {});

  const watched = await watchTmuxScoutOutputs({ jobs, timeoutMs });
  const completedAt = nowIso();
  if (!keepTmux) await cleanupTmuxScoutSession({ session, tmux, root, missionId });
  return {
    engine: 'tmux-lanes',
    engine_run_id: engineRunId,
    artifact_namespace: artifactNamespace,
    engine_mode: 'tmux_lane',
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.now() - startMs,
    session,
    jobs: watched.jobs
  };
}

function blockedResult({ startedAt, startMs, jobs, blockers }: any) {
  return {
    engine: 'tmux-lanes',
    started_at: startedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - startMs,
    blockers,
    jobs: jobs.map((job: any) => ({ ...job, status: 'rejected', code: 127, reason: blockers.join('; ') }))
  };
}

function shellQuote(value: any) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

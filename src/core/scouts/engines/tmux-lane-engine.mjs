import path from 'node:path';
import { buildCodexExecArgs, findCodexBinary } from '../../codex-adapter.mjs';
import { nowIso, runProcess, which } from '../../fsx.mjs';
import { appendScoutLedger } from '../scout-artifacts.mjs';
import { buildScoutPrompt } from './scout-engine-base.mjs';
import { cleanupTmuxScoutSession } from './tmux-lane-cleanup.mjs';
import { watchTmuxScoutOutputs } from './tmux-lane-watcher.mjs';

export async function runTmuxLaneEngine(root, {
  missionId,
  dir,
  route,
  task,
  roles,
  attach = false,
  keepTmux = false,
  timeoutMs = Number(process.env.SKS_SCOUT_TMUX_TIMEOUT_MS || 120000)
} = {}) {
  const startedAt = nowIso();
  const startMs = Date.now();
  const tmux = await which('tmux');
  const codex = await findCodexBinary();
  const session = `sks-scouts-${String(missionId || 'manual').replace(/[^A-Za-z0-9_-]/g, '-')}`;
  const jobs = roles.map((role) => ({
    scout_id: role.id,
    output_file: path.join(dir, `${role.id}.tmux.md`),
    stdout_file: path.join(dir, `${role.id}.tmux.stdout.log`),
    stderr_file: path.join(dir, `${role.id}.tmux.stderr.log`)
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
    const args = buildCodexExecArgs({ root, prompt, outputFile: job.output_file, json: true, profile: process.env.SKS_SCOUT_CODEX_PROFILE || 'sks-scout-readonly' });
    const command = `${shellQuote(codex)} ${args.map(shellQuote).join(' ')} > ${shellQuote(job.stdout_file)} 2> ${shellQuote(job.stderr_file)}`;
    await runProcess(tmux, ['send-keys', '-t', `${session}:${window}`, command, 'C-m'], { timeoutMs: 10000, maxOutputBytes: 8192 });
    await appendScoutLedger(root, missionId, { type: 'scout.tmux_lane.started', scout_id: role.id, session, window, output_file: job.output_file });
  }
  if (attach) await runProcess(tmux, ['display-message', '-t', session, `SKS scouts running in ${session}`], { timeoutMs: 5000, maxOutputBytes: 4096 }).catch(() => {});

  const watched = await watchTmuxScoutOutputs({ jobs, timeoutMs });
  const completedAt = nowIso();
  if (!keepTmux) await cleanupTmuxScoutSession({ session, tmux, root, missionId });
  return {
    engine: 'tmux-lanes',
    started_at: startedAt,
    completed_at: completedAt,
    duration_ms: Date.now() - startMs,
    session,
    jobs: watched.jobs
  };
}

function blockedResult({ startedAt, startMs, jobs, blockers }) {
  return {
    engine: 'tmux-lanes',
    started_at: startedAt,
    completed_at: nowIso(),
    duration_ms: Date.now() - startMs,
    blockers,
    jobs: jobs.map((job) => ({ ...job, status: 'rejected', code: 127, reason: blockers.join('; ') }))
  };
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

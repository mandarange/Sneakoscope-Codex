import { appendScoutLedger } from '../scout-artifacts.mjs';

export async function cleanupTmuxScoutSession({ session, tmux, root, missionId } = {}) {
  if (!tmux || !session) return { ok: false, reason: 'tmux_or_session_missing' };
  const { runProcess } = await import('../../fsx.mjs');
  const result = await runProcess(tmux, ['kill-session', '-t', session], { timeoutMs: 10000, maxOutputBytes: 8192 }).catch((err) => ({ code: 1, stderr: err.message }));
  if (root && missionId) {
    await appendScoutLedger(root, missionId, {
      type: 'scout.tmux_lane.cleanup',
      session,
      status: result.code === 0 ? 'done' : 'blocked',
      stderr_tail: String(result.stderr || '').slice(-400)
    });
  }
  return { ok: result.code === 0, code: result.code };
}

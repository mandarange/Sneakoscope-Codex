import path from 'node:path';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.mjs';
export async function writeAgentCleanupReport(root) {
    const sessions = await readJson(path.join(root, 'agent-sessions.json'), { sessions: {} });
    const rows = Object.values(sessions.sessions || {});
    const closed = rows.filter((session) => String(session.status) === 'closed');
    const terminal = rows.filter((session) => ['closed', 'blocked', 'failed', 'killed', 'timed_out'].includes(String(session.status)));
    const report = {
        schema: 'sks.agent-cleanup.v1',
        generated_at: nowIso(),
        launched_count: rows.filter((session) => Boolean(session.opened_at)).length,
        closed_session_count: closed.length,
        terminal_session_count: terminal.length,
        total_sessions: rows.length,
        all_sessions_closed: rows.length > 0 && closed.length === rows.length,
        all_sessions_terminal: rows.length > 0 && terminal.length === rows.length,
        killed_sessions: rows.filter((session) => String(session.status) === 'killed').map((session) => session.session_id),
        timed_out_sessions: rows.filter((session) => String(session.status) === 'timed_out').map((session) => session.session_id)
    };
    await writeJsonAtomic(path.join(root, 'agent-cleanup.json'), report);
    await writeJsonAtomic(path.join(root, 'agent-session-cleanup.json'), { ...report, schema: 'sks.agent-session-cleanup.v1', source: 'agent-cleanup.json' });
    return report;
}
//# sourceMappingURL=agent-cleanup.js.map
import path from 'node:path';
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
export async function writeAgentTrustReport(root, input = {}) {
    const report = {
        schema: 'sks.agent-trust-report.v1',
        generated_at: nowIso(),
        agent_orchestration: {
            backend: input.backend || 'unknown',
            agent_count: input.roster?.agent_count || 0,
            default_agents: input.roster?.default_agents || 5,
            max_agents: input.roster?.max_agents || 20,
            no_overlap_ok: input.partition?.no_overlap_proof?.ok !== false,
            ledger_hash_chain_ok: input.ledger?.ok !== false,
            all_sessions_closed: input.cleanup?.all_sessions_closed === true,
            output_schema_ok: input.output_schema_ok !== false,
            output_tail_report: 'agent-output-tails.json',
            output_tail_records: Number(input.outputTails?.record_count || 0),
            timeout_kill_report: 'agent-timeout-kill-report.json',
            killed_timed_out_sessions: Array.isArray(input.timeoutKill?.killed_sessions) ? input.timeoutKill.killed_sessions : [],
            fake_backend_disclaimer: input.backend === 'fake' ? 'fixture only; no real parallel execution claim' : null
        },
        blockers: Array.isArray(input.blockers) ? input.blockers : []
    };
    await writeJsonAtomic(path.join(root, 'agent-trust-report.json'), report);
    await writeTextAtomic(path.join(root, 'agent-trust-report.md'), renderAgentTrustReportMarkdown(report));
    return report;
}
function renderAgentTrustReportMarkdown(report) {
    const orchestration = report.agent_orchestration || {};
    return [
        '# Agent Trust Report',
        '',
        `- backend: ${orchestration.backend || 'unknown'}`,
        `- agent_count: ${orchestration.agent_count || 0}`,
        `- all_sessions_closed: ${orchestration.all_sessions_closed === true}`,
        `- no_overlap_ok: ${orchestration.no_overlap_ok === true}`,
        `- ledger_hash_chain_ok: ${orchestration.ledger_hash_chain_ok === true}`,
        `- blockers: ${(report.blockers || []).length}`,
        ''
    ].join('\n');
}
//# sourceMappingURL=agent-trust-report.js.map
import { validateAgentWorkerResult } from './agent-worker-pipeline.mjs';
export async function runFakeAgent(agent, slice, opts = {}) {
    return validateAgentWorkerResult({
        mission_id: opts.missionId || opts.mission_id || '',
        agent_id: agent.id,
        session_id: agent.session_id,
        persona_id: agent.persona_id || agent.id,
        task_slice_id: slice?.id || '',
        status: 'done',
        backend: 'fake',
        summary: 'Fixture agent ' + agent.id + ' completed ' + (slice?.id || 'slice') + ' for ' + (opts.route || 'agent-run') + '.',
        findings: ['fixture agent completed assigned slice'],
        proposed_changes: [],
        changed_files: [],
        lease_compliance: { ok: true, violations: [] },
        artifacts: ['agent-events.jsonl', 'agent-task-board.json'],
        blockers: [],
        confidence: 'fixture',
        handoff_notes: 'No handoff required for fake backend fixture.',
        unverified: ['fake backend does not prove real parallel execution'],
        writes: [],
        verification: { status: 'fixture', checks: ['schema-normalized-result'] },
        recursion_guard: { ok: true, violations: [] }
    });
}
//# sourceMappingURL=agent-runner-fake.js.map
import path from 'node:path';
import { AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.mjs';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.mjs';
import { validateAgentLedgerHashChain } from './agent-central-ledger.mjs';
import { assertAllAgentSessionsClosed } from './agent-lifecycle.mjs';
export async function writeAgentProofEvidence(root, input) {
    const lifecycle = await assertAllAgentSessionsClosed(root);
    const ledger = await validateAgentLedgerHashChain(root);
    const blockers = [
        ...(lifecycle.ok ? [] : lifecycle.open_sessions.map((id) => 'session_open:' + id)),
        ...(ledger.blockers || []),
        ...(input.partition?.blockers || []),
        ...(input.consensus?.blockers || []),
        ...(input.results || []).flatMap((result) => result.blockers || []),
        ...agentChangedFileLeaseViolations(input.results || [], input.partition?.leases || [])
    ];
    const evidence = {
        schema: AGENT_PROOF_EVIDENCE_SCHEMA,
        ok: blockers.length === 0,
        status: blockers.length ? 'blocked' : 'passed',
        generated_at: nowIso(),
        mission_id: input.missionId,
        backend: input.backend,
        real_parallel_claim: input.realParallel === true && input.backend === 'codex-exec',
        fake_backend_disclaimer: input.backend === 'fake' ? 'fixture only; no real parallel execution claim' : null,
        agent_count: input.roster?.agent_count || input.results?.length || 0,
        max_agents: input.roster?.max_agents || 20,
        all_sessions_closed: lifecycle.ok,
        launched_count: lifecycle.launched_count,
        closed_session_count: lifecycle.closed_session_count,
        ledger_hash_chain_ok: ledger.ok,
        no_overlap_ok: input.partition?.no_overlap_proof?.ok !== false,
        consensus_ok: input.consensus?.ok === true,
        output_tail_report: 'agent-output-tails.json',
        output_tail_records: Number(input.outputTails?.record_count || 0),
        timeout_kill_report: 'agent-timeout-kill-report.json',
        timeout_killed_sessions: Array.isArray(input.timeoutKill?.killed_sessions) ? input.timeoutKill.killed_sessions : [],
        cleanup_report: 'agent-cleanup.json',
        trust_report: 'agent-trust-report.json',
        wrongness_records: 'agent-wrongness-records.json',
        changed_files_lease_checked: true,
        dependency_collision_risk: input.partition?.no_overlap_proof?.dependency_collision_risk || [],
        blockers
    };
    await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), evidence);
    return evidence;
}
export async function readAgentProofEvidence(root, missionId) {
    return readJson(path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'agent-proof-evidence.json'), null);
}
function agentChangedFileLeaseViolations(results, leases) {
    const activeWrites = leases.filter((lease) => lease.kind === 'write' && lease.status !== 'released');
    const violations = [];
    for (const result of results) {
        const agentId = result.agent_id;
        for (const file of result.changed_files || []) {
            const normalized = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
            const allowed = activeWrites.some((lease) => lease.agent_id === agentId && pathWithin(normalized, lease.path));
            if (!allowed)
                violations.push('lease_changed_file_violation:' + agentId + ':' + normalized);
        }
    }
    return violations;
}
function pathWithin(file, leasePath) {
    const left = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '');
    const right = String(leasePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
    return left === right || left.startsWith(right + '/');
}
//# sourceMappingURL=agent-proof-evidence.js.map
import path from 'node:path';
import { createMission, missionDir, setCurrent } from '../mission.mjs';
import { nowIso, readJson, writeJsonAtomic } from '../fsx.mjs';
import { buildAgentRoster, normalizeAgentConcurrency } from './agent-roster.mjs';
import { buildAgentWorkPartition } from './agent-work-partition.mjs';
import { initializeAgentCentralLedger, appendAgentLedgerEvent, compactAgentLedger } from './agent-central-ledger.mjs';
import { detectStaleAgentSessions, killTimedOutAgentSessions, openAgentSession, heartbeatAgentSession, collectAgentSession, completeAgentSession, closeAgentSession, writeAgentLifecycleAggregate, writeAgentLifecyclePolicy } from './agent-lifecycle.mjs';
import { writeAgentConsensus } from './agent-consensus.mjs';
import { writeAgentProofEvidence } from './agent-proof-evidence.mjs';
import { normalizeAgentBackend } from './agent-schema.mjs';
import { runFakeAgent } from './agent-runner-fake.mjs';
import { runProcessAgent } from './agent-runner-process.mjs';
import { runCodexExecAgent } from './agent-runner-codex-exec.mjs';
import { runTmuxAgent } from './agent-runner-tmux.mjs';
import { writeAgentCleanupReport } from './agent-cleanup.mjs';
import { writeAgentTrustReport } from './agent-trust-report.mjs';
import { writeAgentWrongnessRecords } from './agent-wrongness.mjs';
import { writeAgentRecursionGuardReport } from './agent-recursion-guard.mjs';
export async function runNativeAgentOrchestrator(opts = {}) {
    const root = path.resolve(opts.root || process.cwd());
    const prompt = String(opts.prompt || 'Native agent run');
    const route = opts.route || '$Agent';
    const backend = normalizeAgentBackend(opts.backend || (opts.mock ? 'fake' : 'codex-exec'));
    const created = opts.missionId
        ? { id: opts.missionId, dir: missionDir(root, opts.missionId), mission: { id: opts.missionId, mode: 'agent', prompt } }
        : await createMission(root, { mode: 'agent', prompt });
    const missionId = created.id;
    const dir = created.dir;
    const roster = buildProvidedAgentRoster(opts.roster, { concurrency: opts.concurrency, readonly: opts.readonly }) || buildAgentRoster({ agents: opts.agents, concurrency: opts.concurrency, prompt, ...(opts.readonly === undefined ? {} : { readonly: opts.readonly }) });
    const partition = await buildAgentWorkPartition(root, roster, prompt);
    const ledgerRoot = await initializeAgentCentralLedger(dir, { missionId, roster, partition, route, prompt });
    await writeJsonAtomic(path.join(ledgerRoot, 'agent-no-overlap-proof.json'), partition.no_overlap_proof || { schema: 'sks.agent-no-overlap-proof.v1', ok: false, blockers: ['missing_no_overlap_proof'] });
    await writeAgentLifecyclePolicy(ledgerRoot);
    await writeAgentLifecycleAggregate(ledgerRoot);
    await writeJsonAtomic(path.join(ledgerRoot, 'agent-concurrency-policy.json'), {
        schema: 'sks.agent-concurrency-policy.v1',
        default_agents: roster.default_agents,
        max_agents: roster.max_agents,
        agents: roster.agent_count,
        concurrency: roster.concurrency,
        batch_count: roster.batch_count,
        backpressure: 'batch scheduling by concurrency cap',
        rate_limit_delay_ms: backend === 'codex-exec' ? 250 : 0,
        resource_pressure_warnings: roster.agent_count > roster.concurrency ? ['agents_exceed_concurrency_batches'] : []
    });
    await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_NATIVE_KERNEL_RUNNING', route_command: 'sks agent', native_agent_backend: backend });
    const results = [];
    const slices = partition.slices || [];
    for (let start = 0; start < roster.roster.length; start += roster.concurrency) {
        const batch = roster.roster.slice(start, start + roster.concurrency);
        const batchResults = await Promise.all(batch.map(async (agent, batchIndex) => {
            const slice = slices[start + batchIndex] || { id: 'slice-' + String(start + batchIndex + 1), description: prompt };
            await openAgentSession(ledgerRoot, agent);
            await heartbeatAgentSession(ledgerRoot, agent);
            await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_started', payload: { backend, slice_id: slice.id } });
            const result = await runAgentByBackend(backend, agent, slice, { ...opts, missionId, agentRoot: ledgerRoot, cwd: root, route, prompt });
            await collectAgentSession(ledgerRoot, agent);
            await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_result', payload: result });
            if (result.status === 'done')
                await completeAgentSession(ledgerRoot, agent);
            await closeAgentSession(ledgerRoot, agent, result.status === 'done' ? 'closed' : result.status);
            return result;
        }));
        results.push(...batchResults);
    }
    const stale = await detectStaleAgentSessions(ledgerRoot);
    if (!stale.ok)
        await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'stale_sessions_detected', payload: stale });
    const timeoutKill = await killTimedOutAgentSessions(ledgerRoot);
    const recursion = await writeAgentRecursionGuardReport(ledgerRoot, results);
    const consensus = await writeAgentConsensus(ledgerRoot, results);
    const outputValidation = await writeAgentOutputValidationReport(ledgerRoot, results);
    const outputTails = await writeAgentOutputTailReport(ledgerRoot, results);
    const backendReport = await writeAgentBackendReport(ledgerRoot, { backend, results, outputTails });
    await compactAgentLedger(ledgerRoot);
    const cleanup = await writeAgentCleanupReport(ledgerRoot);
    const blockers = [
        ...results.flatMap((result) => result.blockers || []),
        ...(stale.ok ? [] : stale.stale_sessions.map((id) => 'stale_heartbeat:' + id)),
        ...(timeoutKill.killed_sessions || []).map((id) => 'timeout_killed:' + id),
        ...(recursion.ok ? [] : recursion.violations.map((id) => 'recursion:' + id))
    ];
    const trust = await writeAgentTrustReport(ledgerRoot, { backend, roster, partition, cleanup, outputTails, timeoutKill, backendReport, outputValidation, blockers });
    const wrongness = await writeAgentWrongnessRecords(ledgerRoot, blockers);
    const proof = await writeAgentProofEvidence(ledgerRoot, { missionId, backend, realParallel: backend === 'codex-exec' && opts.mock !== true, roster, partition, consensus, results, cleanup, outputTails, timeoutKill, trust, wrongness });
    await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: proof.ok ? 'AGENT_NATIVE_KERNEL_DONE' : 'AGENT_NATIVE_KERNEL_BLOCKED', native_agent_backend: backend, updated_at: nowIso() });
    return {
        schema: 'sks.agent-run.v1',
        ok: proof.ok,
        mission_id: missionId,
        route,
        backend,
        ledger_root: path.relative(root, ledgerRoot),
        roster,
        partition: { ok: partition.ok, slice_count: partition.slices.length, lease_count: partition.leases.length, blockers: partition.blockers },
        results,
        consensus,
        output_validation: outputValidation,
        backend_report: backendReport,
        recursion,
        timeout_kill: timeoutKill,
        output_tails: outputTails,
        cleanup,
        trust,
        wrongness,
        proof
    };
}
function buildProvidedAgentRoster(input, opts = {}) {
    const sourceRows = Array.isArray(input?.roster) ? input.roster : Array.isArray(input?.personas) ? input.personas : [];
    if (!sourceRows.length)
        return null;
    const agentCount = sourceRows.length;
    const concurrency = normalizeAgentConcurrency(opts.concurrency ?? input?.concurrency ?? agentCount, agentCount);
    const personas = Array.isArray(input?.personas) ? input.personas : sourceRows;
    const roster = sourceRows.map((entry, index) => {
        const readOnly = opts.readonly === true || entry.read_only === true;
        const id = String(entry.id || entry.agent_id || `agent_${index + 1}`);
        return {
            id,
            session_id: String(entry.session_id || `${id}-session-${String(index + 1).padStart(2, '0')}`),
            persona_id: String(entry.persona_id || id),
            role: String(entry.role || 'verifier'),
            index: index + 1,
            write_policy: String(entry.write_policy || (readOnly ? 'read-only' : 'route-local-artifact')),
            status: 'pending',
            reasoning_effort: entry.reasoning_effort || entry.model_reasoning_effort || (readOnly ? 'high' : 'medium'),
            model_reasoning_effort: entry.model_reasoning_effort || entry.reasoning_effort || (readOnly ? 'high' : 'medium'),
            reasoning_profile: entry.reasoning_profile || (readOnly ? 'sks-logic-high' : 'sks-logic-medium'),
            service_tier: entry.service_tier,
            reasoning_reason: entry.reasoning_reason || 'route_native_agent_plan',
            dynamic_effort_policy: entry.dynamic_effort_policy || {
                escalation_triggers: ['route_requires_native_agent_proof'],
                downshift_triggers: []
            }
        };
    });
    return {
        schema: 'sks.agent-roster.v1',
        default_agents: agentCount,
        max_agents: Math.max(agentCount, 20),
        agent_count: agentCount,
        concurrency,
        batch_count: Math.ceil(agentCount / concurrency),
        personas,
        persona_uniqueness: { ok: true, duplicate_ids: [] },
        roster,
        effort_policy: input?.effort_policy || { schema: 'sks.agent-effort-policy.v1', dynamic: true, decisions: [] }
    };
}
async function runAgentByBackend(backend, agent, slice, opts) {
    if (backend === 'process')
        return runProcessAgent(agent, slice, opts);
    if (backend === 'codex-exec')
        return runCodexExecAgent(agent, slice, { ...opts, dryRun: opts.real === true ? false : true });
    if (backend === 'tmux')
        return runTmuxAgent(agent, slice, opts);
    return runFakeAgent(agent, slice, opts);
}
async function writeAgentOutputTailReport(root, results) {
    const records = [];
    for (const result of results || []) {
        for (const artifact of result.artifacts || []) {
            const artifactPath = String(artifact || '');
            if (!artifactPath.endsWith('agent-process-report.json'))
                continue;
            const full = path.isAbsolute(artifactPath) ? artifactPath : path.join(root, artifactPath);
            const report = await readJson(full, null).catch(() => null);
            if (!report)
                continue;
            records.push({
                agent_id: result.agent_id || report.agent_id || null,
                session_id: result.session_id || report.session_id || null,
                backend: result.backend || report.backend || null,
                artifact: artifactPath,
                stdout_tail: String(report.stdout_tail || '').slice(-4000),
                stderr_tail: String(report.stderr_tail || '').slice(-4000),
                stdout_bytes: Number(report.stdout_bytes || 0),
                stderr_bytes: Number(report.stderr_bytes || 0),
                truncated: Boolean(report.truncated),
                timed_out: Boolean(report.timed_out)
            });
        }
    }
    const report = {
        schema: 'sks.agent-output-tails.v1',
        generated_at: nowIso(),
        record_count: records.length,
        records
    };
    await writeJsonAtomic(path.join(root, 'agent-output-tails.json'), report);
    return report;
}
async function writeAgentBackendReport(root, input = {}) {
    const report = {
        schema: 'sks.agent-backend-report.v1',
        generated_at: nowIso(),
        backend: input.backend || 'unknown',
        result_count: (input.results || []).length,
        output_tail_report: 'agent-output-tails.json',
        records: (input.results || []).map((result) => ({
            agent_id: result.agent_id || null,
            session_id: result.session_id || null,
            backend: result.backend || input.backend || null,
            status: result.status || null,
            artifacts: result.artifacts || [],
            blockers: result.blockers || [],
            verification: result.verification || null
        }))
    };
    await writeJsonAtomic(path.join(root, 'agent-backend-report.json'), report);
    return report;
}
async function writeAgentOutputValidationReport(root, results) {
    const records = (results || []).map((result) => {
        const blockers = Array.isArray(result.blockers) ? result.blockers : [];
        return {
            agent_id: result.agent_id || null,
            session_id: result.session_id || null,
            schema_ok: !blockers.some((blocker) => String(blocker).startsWith('schema_invalid:')),
            recursion_ok: result.recursion_guard?.ok !== false,
            status: result.status || null,
            blockers
        };
    });
    const report = {
        schema: 'sks.agent-output-validation.v1',
        generated_at: nowIso(),
        ok: records.every((record) => record.schema_ok && record.recursion_ok),
        record_count: records.length,
        records
    };
    await writeJsonAtomic(path.join(root, 'agent-output-validation.json'), report);
    return report;
}
//# sourceMappingURL=agent-orchestrator.js.map

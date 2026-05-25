import path from 'node:path'
import { createMission, missionDir, setCurrent } from '../mission.js'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { buildAgentRoster, normalizeAgentConcurrency } from './agent-roster.js'
import { buildAgentWorkPartition } from './agent-work-partition.js'
import { initializeAgentCentralLedger, appendAgentLedgerEvent, compactAgentLedger } from './agent-central-ledger.js'
import { detectStaleAgentSessions, killTimedOutAgentSessions, openAgentSession, heartbeatAgentSession, collectAgentSession, completeAgentSession, closeAgentSession, writeAgentLifecycleAggregate, writeAgentLifecyclePolicy } from './agent-lifecycle.js'
import { writeAgentConsensus } from './agent-consensus.js'
import { writeAgentProofEvidence } from './agent-proof-evidence.js'
import { normalizeAgentBackend } from './agent-schema.js'
import type { AgentRunOptions } from './agent-schema.js'
import { runFakeAgent } from './agent-runner-fake.js'
import { runProcessAgent } from './agent-runner-process.js'
import { runCodexExecAgent } from './agent-runner-codex-exec.js'
import { runTmuxAgent } from './agent-runner-tmux.js'
import { writeAgentCleanupReport } from './agent-cleanup.js'
import { writeAgentTrustReport } from './agent-trust-report.js'
import { writeAgentWrongnessRecords } from './agent-wrongness.js'
import { writeAgentRecursionGuardReport } from './agent-recursion-guard.js'
import { appendAgentCodexCockpitHookEvent, writeAgentCodexCockpitArtifacts } from './agent-codex-cockpit.js'
import { runAgentJanitor } from './agent-janitor.js'
import { startAgentTerminalSession, closeAgentTerminalSession } from './agent-terminal-session.js'
import { writeScoutPolicyArtifact } from './scout-policy.js'
import { writeTmuxRightLaneCockpit } from './tmux-right-lane-cockpit.js'
import { buildProjectNamespace, namespacedAgentSessionId, writeProjectNamespaceArtifact } from '../session/project-namespace.js'

export async function runNativeAgentOrchestrator(opts: AgentRunOptions = {}) {
  const root = path.resolve(opts.root || process.cwd())
  const prompt = String(opts.prompt || 'Native agent run')
  const route = opts.route || '$Agent'
  const backend = normalizeAgentBackend(opts.backend || (opts.mock ? 'fake' : 'codex-exec'))
  const created = opts.missionId
    ? { id: opts.missionId, dir: missionDir(root, opts.missionId), mission: { id: opts.missionId, mode: 'agent', prompt } }
    : await createMission(root, { mode: 'agent', prompt })
  const missionId = created.id
  const dir = created.dir
  const namespace = await buildProjectNamespace({ root, missionId })
  await writeProjectNamespaceArtifact(dir, namespace)
  const roster = buildProvidedAgentRoster(opts.roster, { concurrency: opts.concurrency, readonly: opts.readonly }) || buildAgentRoster({ agents: opts.agents, concurrency: opts.concurrency, prompt, ...(opts.readonly === undefined ? {} : { readonly: opts.readonly }) })
  roster.roster = roster.roster.map((agent: any) => ({
    ...agent,
    session_id: namespacedAgentSessionId({
      agentId: agent.id,
      missionId,
      rootHash: namespace.root_hash,
      index: agent.index
    })
  }))
  const partition = await buildAgentWorkPartition(root, roster, prompt)
  await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const ledgerRoot = await initializeAgentCentralLedger(dir, { missionId, roster, partition, route, prompt })
  await writeScoutPolicyArtifact(ledgerRoot)
  await writeTmuxRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, agents: roster.roster })
  await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  await writeJsonAtomic(path.join(ledgerRoot, 'agent-no-overlap-proof.json'), partition.no_overlap_proof || { schema: 'sks.agent-no-overlap-proof.v1', ok: false, blockers: ['missing_no_overlap_proof'] })
  await writeAgentLifecyclePolicy(ledgerRoot)
  await writeAgentLifecycleAggregate(ledgerRoot)
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
  })
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: 'AGENT_NATIVE_KERNEL_RUNNING', route_command: 'sks agent', native_agent_backend: backend })
  const results = []
  const slices = partition.slices || []
  for (let start = 0; start < roster.roster.length; start += roster.concurrency) {
    const batch = roster.roster.slice(start, start + roster.concurrency)
    const batchResults = await Promise.all(batch.map(async (agent: any, batchIndex: number) => {
      const slice = slices[start + batchIndex] || { id: 'slice-' + String(start + batchIndex + 1), description: prompt }
      await openAgentSession(ledgerRoot, agent)
      await heartbeatAgentSession(ledgerRoot, agent)
      await appendAgentCodexCockpitHookEvent(dir, {
        hook_event_name: 'SubagentStart',
        agent_id: agent.id,
        agent_type: agent.role || agent.persona_id || 'agent',
        session_id: agent.session_id,
        cwd: root,
        permission_mode: agent.write_policy || 'read-only',
      })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_started', payload: { backend, slice_id: slice.id } })
      await startAgentTerminalSession(ledgerRoot, agent, {
        backend,
        real: backend === 'process' || (backend === 'codex-exec' && opts.real === true) || backend === 'tmux'
      })
      const result = await runAgentByBackend(backend, agent, slice, { ...opts, missionId, agentRoot: ledgerRoot, cwd: root, route, prompt })
      const terminalClose = await closeAgentTerminalSession(ledgerRoot, agent, {
        exitCode: result.status === 'done' ? 0 : 1,
        status: result.status,
        stdoutTail: result.summary || '',
        stderrTail: (result.blockers || []).join('\n')
      })
      result.artifacts = [...(result.artifacts || []), path.join('sessions', agent.id, 'agent-terminal-session.json'), path.join('sessions', agent.id, 'agent-terminal-close-report.json')]
      result.verification = {
        status: result.verification?.status || 'not_run',
        checks: [...(result.verification?.checks || []), terminalClose.ok ? 'agent-terminal-close-report' : 'agent-terminal-close-report-missing']
      }
      await collectAgentSession(ledgerRoot, agent)
      await appendAgentLedgerEvent(ledgerRoot, { agent_id: agent.id, session_id: agent.session_id, event_type: 'agent_result', payload: result })
      if (result.status === 'done') await completeAgentSession(ledgerRoot, agent)
      await closeAgentSession(ledgerRoot, agent, result.status === 'done' ? 'closed' : result.status)
      await appendAgentCodexCockpitHookEvent(dir, {
        hook_event_name: 'SubagentStop',
        agent_id: agent.id,
        agent_type: agent.role || agent.persona_id || 'agent',
        session_id: agent.session_id,
        cwd: root,
        permission_mode: agent.write_policy || 'read-only',
        last_assistant_message: result.summary || null,
      })
      await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
      return result
    }))
    results.push(...batchResults)
    const periodicJanitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
    if (!periodicJanitor.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'periodic_janitor_blocked', payload: periodicJanitor })
    await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  }
  const stale = await detectStaleAgentSessions(ledgerRoot)
  if (!stale.ok) await appendAgentLedgerEvent(ledgerRoot, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'stale_sessions_detected', payload: stale })
  const timeoutKill = await killTimedOutAgentSessions(ledgerRoot)
  const recursion = await writeAgentRecursionGuardReport(ledgerRoot, results)
  const consensus = await writeAgentConsensus(ledgerRoot, results)
  const outputValidation = await writeAgentOutputValidationReport(ledgerRoot, results)
  const outputTails = await writeAgentOutputTailReport(ledgerRoot, results)
  const backendReport = await writeAgentBackendReport(ledgerRoot, { backend, results, outputTails })
  await writeTmuxRightLaneCockpit(ledgerRoot, { missionId, sessionName: `sks-${missionId}`, agents: roster.roster.map((agent: any) => ({ ...agent, status: 'closed' })) })
  await compactAgentLedger(ledgerRoot)
  const cleanup = await writeAgentCleanupReport(ledgerRoot)
  const janitor = await runAgentJanitor({ missionDir: dir, missionId, projectHash: namespace.root_hash })
  const blockers = [
    ...results.flatMap((result: any) => result.blockers || []),
    ...(stale.ok ? [] : stale.stale_sessions.map((id: string) => 'stale_heartbeat:' + id)),
    ...(timeoutKill.killed_sessions || []).map((id: string) => 'timeout_killed:' + id),
    ...(recursion.ok ? [] : recursion.violations.map((id: string) => 'recursion:' + id)),
    ...(janitor.ok ? [] : janitor.blockers)
  ]
  const trust = await writeAgentTrustReport(ledgerRoot, { missionId, backend, roster, partition, cleanup, outputTails, timeoutKill, backendReport, outputValidation, blockers })
  const wrongness = await writeAgentWrongnessRecords(ledgerRoot, blockers)
  const proof = await writeAgentProofEvidence(ledgerRoot, { missionId, backend, realParallel: backend === 'codex-exec' && opts.mock !== true, roster, partition, consensus, results, cleanup, janitor, outputTails, timeoutKill, trust, wrongness })
  await writeAgentCodexCockpitArtifacts(dir, { missionId, projectHash: namespace.root_hash })
  await setCurrent(root, { mission_id: missionId, mode: 'AGENT', phase: proof.ok ? 'AGENT_NATIVE_KERNEL_DONE' : 'AGENT_NATIVE_KERNEL_BLOCKED', native_agent_backend: backend, updated_at: nowIso() })
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
  }
}

function buildProvidedAgentRoster(input: any, opts: any = {}) {
  const sourceRows = Array.isArray(input?.roster) ? input.roster : Array.isArray(input?.personas) ? input.personas : []
  if (!sourceRows.length) return null
  const agentCount = sourceRows.length
  const concurrency = normalizeAgentConcurrency(opts.concurrency ?? input?.concurrency ?? agentCount, agentCount)
  const personas = Array.isArray(input?.personas) ? input.personas : sourceRows
  const roster = sourceRows.map((entry: any, index: number) => {
    const readOnly = opts.readonly === true || entry.read_only === true
    const id = String(entry.id || entry.agent_id || `agent_${index + 1}`)
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
    }
  })
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
  }
}

async function runAgentByBackend(backend: string, agent: any, slice: any, opts: any) {
  if (backend === 'process') return runProcessAgent(agent, slice, opts)
  if (backend === 'codex-exec') return runCodexExecAgent(agent, slice, { ...opts, dryRun: opts.real === true ? false : true })
  if (backend === 'tmux') return runTmuxAgent(agent, slice, opts)
  return runFakeAgent(agent, slice, opts)
}

async function writeAgentOutputTailReport(root: string, results: any[]) {
  const records = []
  for (const result of results || []) {
    for (const artifact of result.artifacts || []) {
      const artifactPath = String(artifact || '')
      if (!artifactPath.endsWith('agent-process-report.json')) continue
      const full = path.isAbsolute(artifactPath) ? artifactPath : path.join(root, artifactPath)
      const report = await readJson<any>(full, null).catch(() => null)
      if (!report) continue
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
      })
    }
  }
  const report = {
    schema: 'sks.agent-output-tails.v1',
    generated_at: nowIso(),
    record_count: records.length,
    records
  }
  await writeJsonAtomic(path.join(root, 'agent-output-tails.json'), report)
  return report
}

async function writeAgentBackendReport(root: string, input: any = {}) {
  const report = {
    schema: 'sks.agent-backend-report.v1',
    generated_at: nowIso(),
    backend: input.backend || 'unknown',
    result_count: (input.results || []).length,
    output_tail_report: 'agent-output-tails.json',
    records: (input.results || []).map((result: any) => ({
      agent_id: result.agent_id || null,
      session_id: result.session_id || null,
      backend: result.backend || input.backend || null,
      status: result.status || null,
      artifacts: result.artifacts || [],
      blockers: result.blockers || [],
      verification: result.verification || null
    }))
  }
  await writeJsonAtomic(path.join(root, 'agent-backend-report.json'), report)
  return report
}

async function writeAgentOutputValidationReport(root: string, results: any[]) {
  const records = (results || []).map((result: any) => {
    const blockers = Array.isArray(result.blockers) ? result.blockers : []
    return {
      agent_id: result.agent_id || null,
      session_id: result.session_id || null,
      schema_ok: !blockers.some((blocker: string) => String(blocker).startsWith('schema_invalid:')),
      recursion_ok: result.recursion_guard?.ok !== false,
      status: result.status || null,
      blockers
    }
  })
  const report = {
    schema: 'sks.agent-output-validation.v1',
    generated_at: nowIso(),
    ok: records.every((record) => record.schema_ok && record.recursion_ok),
    record_count: records.length,
    records
  }
  await writeJsonAtomic(path.join(root, 'agent-output-validation.json'), report)
  return report
}

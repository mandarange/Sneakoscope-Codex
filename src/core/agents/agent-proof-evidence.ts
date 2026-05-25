import path from 'node:path'
import { AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.js'
import { nowIso, readJson, writeJsonAtomic } from '../fsx.js'
import { validateAgentLedgerHashChain } from './agent-central-ledger.js'
import { assertAllAgentSessionsClosed } from './agent-lifecycle.js'
import { assertAgentTerminalSessionsClosed } from './agent-terminal-session.js'

export async function writeAgentProofEvidence(root: string, input: { missionId: string; backend: string; realParallel?: boolean; roster?: any; partition?: any; consensus?: any; results?: any[]; cleanup?: any; janitor?: any; trust?: any; wrongness?: any; outputTails?: any; timeoutKill?: any }) {
  const lifecycle = await assertAllAgentSessionsClosed(root)
  const terminal = await assertAgentTerminalSessionsClosed(root)
  const ledger = await validateAgentLedgerHashChain(root)
  const tmuxLanes = await readJson<any>(path.join(root, 'agent-tmux-lanes.json'), null)
  const blockers = [
    ...(lifecycle.ok ? [] : ['agent_lifecycle_not_all_closed']),
    ...(lifecycle.ok ? [] : lifecycle.open_sessions.map((id: string) => 'session_open:' + id)),
    ...((input.timeoutKill?.killed_sessions || []).map((id: string) => 'session_timeout_killed:' + id)),
    ...(terminal.ok ? [] : terminal.blockers),
    ...(input.backend === 'tmux' && tmuxLanes?.ok !== true ? ['tmux_right_lane_manifest_missing'] : []),
    ...(ledger.blockers || []),
    ...(input.partition?.blockers || []),
    ...(input.consensus?.blockers || []),
    ...(input.janitor?.ok === false ? input.janitor.blockers || ['agent_janitor_not_ok'] : []),
    ...(input.results || []).flatMap((result: any) => result.blockers || []),
    ...agentChangedFileLeaseViolations(input.results || [], input.partition?.leases || [])
  ]
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
    terminal_sessions_closed: terminal.ok,
    terminal_session_count: terminal.total_sessions,
    terminal_close_report: 'sessions/<agent_id>/agent-terminal-close-report.json',
    tmux_lane_manifest: 'agent-tmux-lanes.json',
    tmux_lane_manifest_ok: tmuxLanes?.ok === true,
    ledger_hash_chain_ok: ledger.ok,
    no_overlap_ok: input.partition?.no_overlap_proof?.ok !== false,
    consensus_ok: input.consensus?.ok === true,
    output_tail_report: 'agent-output-tails.json',
    output_tail_records: Number(input.outputTails?.record_count || 0),
    timeout_kill_report: 'agent-timeout-kill-report.json',
    timeout_killed_sessions: Array.isArray(input.timeoutKill?.killed_sessions) ? input.timeoutKill.killed_sessions : [],
    cleanup_report: 'agent-cleanup.json',
    janitor_report: 'agent-janitor-report.json',
    janitor_ok: input.janitor?.ok !== false,
    trust_report: 'agent-trust-report.json',
    wrongness_records: 'agent-wrongness-records.json',
    changed_files_lease_checked: true,
    dependency_collision_risk: input.partition?.no_overlap_proof?.dependency_collision_risk || [],
    blockers
  }
  await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), evidence)
  return evidence
}

export async function readAgentProofEvidence(root: string, missionId: string) {
  return readJson(path.join(root, '.sneakoscope', 'missions', missionId, 'agents', 'agent-proof-evidence.json'), null)
}

function agentChangedFileLeaseViolations(results: any[], leases: any[]) {
  const activeWrites = leases.filter((lease) => lease.kind === 'write' && lease.status !== 'released')
  const violations: string[] = []
  for (const result of results) {
    const agentId = result.agent_id
    for (const file of result.changed_files || []) {
      const normalized = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '')
      const allowed = activeWrites.some((lease) => lease.agent_id === agentId && pathWithin(normalized, lease.path))
      if (!allowed) violations.push('lease_changed_file_violation:' + agentId + ':' + normalized)
    }
  }
  return violations
}

function pathWithin(file: string, leasePath: string) {
  const left = String(file || '').replace(/\\/g, '/').replace(/^\.\//, '')
  const right = String(leasePath || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '')
  return left === right || left.startsWith(right + '/')
}

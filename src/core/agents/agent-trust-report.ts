import path from 'node:path'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'

export async function writeAgentTrustReport(root: string, input: any = {}) {
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
      terminal_sessions_closed: input.terminal_sessions_closed ?? input.proof?.terminal_sessions_closed ?? null,
      terminal_close_report: 'sessions/<agent_id>/agent-terminal-close-report.json',
      tmux_attach_command: input.missionId ? `tmux attach -t sks-${input.missionId}` : null,
      tmux_lane_manifest: 'agent-tmux-lanes.json',
      output_schema_ok: input.output_schema_ok !== false,
      output_tail_report: 'agent-output-tails.json',
      output_tail_records: Number(input.outputTails?.record_count || 0),
      timeout_kill_report: 'agent-timeout-kill-report.json',
      killed_timed_out_sessions: Array.isArray(input.timeoutKill?.killed_sessions) ? input.timeoutKill.killed_sessions : [],
      fake_backend_disclaimer: input.backend === 'fake' ? 'fixture only; no real parallel execution claim' : null
    },
    blockers: Array.isArray(input.blockers) ? input.blockers : []
  }
  await writeJsonAtomic(path.join(root, 'agent-trust-report.json'), report)
  await writeTextAtomic(path.join(root, 'agent-trust-report.md'), renderAgentTrustReportMarkdown(report))
  return report
}

function renderAgentTrustReportMarkdown(report: any) {
  const orchestration = report.agent_orchestration || {}
  return [
    '# Agent Trust Report',
    '',
    `- backend: ${orchestration.backend || 'unknown'}`,
    `- agent_count: ${orchestration.agent_count || 0}`,
    `- all_sessions_closed: ${orchestration.all_sessions_closed === true}`,
    `- terminal_sessions_closed: ${orchestration.terminal_sessions_closed === true}`,
    `- tmux_lane_manifest: ${orchestration.tmux_lane_manifest || 'unknown'}`,
    `- no_overlap_ok: ${orchestration.no_overlap_ok === true}`,
    `- ledger_hash_chain_ok: ${orchestration.ledger_hash_chain_ok === true}`,
    `- blockers: ${(report.blockers || []).length}`,
    ''
  ].join('\n')
}

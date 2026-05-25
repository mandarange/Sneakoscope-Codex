import path from 'node:path'
import { nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { readTmuxLaneSupervisor } from './tmux-lane-supervisor.js'

export async function writeAgentTrustReport(root: string, input: any = {}) {
  const laneSupervisor = await readTmuxLaneSupervisor(root)
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
      terminal_close_report: 'sessions/<slot_id>/gen-<n>/agent-terminal-close-report.json',
      target_active_slots: input.proof?.target_active_slots ?? input.scheduler?.target_active_slots ?? null,
      total_work_items: input.scheduler?.total_work_items ?? null,
      pending_count: input.scheduler?.pending_count ?? null,
      active_slot_count: input.scheduler?.active_slot_count ?? null,
      completed_count: input.scheduler?.completed_count ?? null,
      max_observed_active_slots: input.proof?.max_observed_active_slots ?? input.scheduler?.max_observed_active_slots ?? null,
      backfill_count: input.proof?.backfill_count ?? input.scheduler?.backfill_count ?? null,
      expected_backfill_count: input.proof?.expected_backfill_count ?? input.scheduler?.expected_backfill_count ?? null,
      pending_queue_drained: input.proof?.pending_queue_drained ?? input.scheduler?.pending_queue_drained ?? null,
      generation_count: input.proof?.generation_count ?? null,
      tmux_attach_command: input.missionId ? `tmux attach -t sks-${input.missionId}` : null,
      tmux_lane_manifest: 'agent-tmux-lanes.json',
      tmux_lane_persistence: {
        supervisor: 'agent-tmux-lane-supervisor.json',
        no_flicker_verified: laneSupervisor?.no_flicker_verified === true,
        pane_survival_checked: laneSupervisor?.pane_survival_checked === true,
        unexpected_close_count: laneSupervisor?.unexpected_close_count || 0,
        lane_count: laneSupervisor?.lane_count || 0
      },
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
    `- target_active_slots: ${orchestration.target_active_slots ?? 'unknown'}`,
    `- total_work_items: ${orchestration.total_work_items ?? 'unknown'}`,
    `- active_slot_count: ${orchestration.active_slot_count ?? 'unknown'}`,
    `- completed_count: ${orchestration.completed_count ?? 'unknown'}`,
    `- backfill_count: ${orchestration.backfill_count ?? 'unknown'}`,
    `- expected_backfill_count: ${orchestration.expected_backfill_count ?? 'unknown'}`,
    `- pending_queue_drained: ${orchestration.pending_queue_drained === true}`,
    `- tmux_lane_manifest: ${orchestration.tmux_lane_manifest || 'unknown'}`,
    `- tmux_no_flicker_verified: ${orchestration.tmux_lane_persistence?.no_flicker_verified === true}`,
    `- tmux_pane_survival_checked: ${orchestration.tmux_lane_persistence?.pane_survival_checked === true}`,
    `- generation_count: ${orchestration.generation_count ?? 'unknown'}`,
    `- no_overlap_ok: ${orchestration.no_overlap_ok === true}`,
    `- ledger_hash_chain_ok: ${orchestration.ledger_hash_chain_ok === true}`,
    `- blockers: ${(report.blockers || []).length}`,
    ''
  ].join('\n')
}

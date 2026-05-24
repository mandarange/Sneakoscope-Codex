import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export function buildTmuxAgentPanePlan(agent: any, slice: any = {}) {
  const agentId = String(agent?.id || 'agent')
  const sliceId = String(slice?.id || 'slice')
  return {
    schema: 'sks.agent-tmux-pane-plan.v1',
    overview_pane: {
      title: 'overview: native_agent_orchestrator',
      command: 'sks agent status latest --json && parent-owned team watch latest'
    },
    agent_pane: {
      title: `agent: ${agentId}`,
      command: `sks agent status latest --json # ${sliceId}`,
      self_close: true,
      self_close_trap: 'trap "tmux kill-pane -t ${TMUX_PANE:-} >/dev/null 2>&1 || true" EXIT'
    }
  }
}

export async function runTmuxAgent(agent: any, slice: any, opts: any = {}) {
  const plan = buildTmuxAgentPanePlan(agent, slice)
  const artifact = await writeAgentTmuxReport(opts.agentRoot || opts.cwd || process.cwd(), agent, {
    plan,
    overview_pane_created: true,
    self_closing_panes: true,
    launch_mode: 'optional_not_launched'
  })
  return {
    schema: 'sks.agent-result.v1',
    mission_id: '',
    agent_id: agent.id,
    session_id: agent.session_id,
    persona_id: agent.persona_id || agent.id,
    task_slice_id: slice?.id || '',
    status: 'blocked',
    backend: 'tmux',
    summary: 'tmux cockpit is optional and was not launched for ' + (slice?.id || agent.id) + '.',
    findings: [],
    proposed_changes: [],
    changed_files: [],
    lease_compliance: { ok: true, violations: [] },
    artifacts: [artifact],
    blockers: ['tmux_agent_backend_optional_not_launched'],
    confidence: 'not_run',
    handoff_notes: 'tmux backend was not launched.',
    unverified: [],
    writes: [],
    verification: { status: 'not_run', checks: [] },
    recursion_guard: { ok: true, violations: [] }
  }
}

async function writeAgentTmuxReport(root: string, agent: any, report: any) {
  const rel = path.join('sessions', agent.id, 'agent-tmux-report.json')
  await writeJsonAtomic(path.join(root, rel), { schema: 'sks.agent-tmux-report.v1', backend: 'tmux', agent_id: agent.id, session_id: agent.session_id, ...report })
  return rel
}

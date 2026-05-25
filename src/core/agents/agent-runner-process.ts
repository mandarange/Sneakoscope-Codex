import path from 'node:path'
import { runProcess, writeJsonAtomic } from '../fsx.js'
import { scanAgentTextForRecursion } from './agent-recursion-guard.js'
import { validateAgentWorkerResult } from './agent-worker-pipeline.js'

export async function runProcessAgent(agent: any, slice: any, opts: any = {}) {
  const planned = opts.command ? scanCommandForRecursion(opts.command) : { ok: true, violations: [] }
  if (!planned.ok) {
    return validateAgentWorkerResult({
      mission_id: opts.missionId || opts.mission_id || '',
      agent_id: agent.id,
      session_id: agent.session_id,
      persona_id: agent.persona_id || agent.id,
      task_slice_id: slice?.id || '',
      status: 'blocked',
      backend: 'process',
      summary: 'Process backend command blocked by agent recursion guard.',
      artifacts: [],
      blockers: planned.violations.map((entry: string) => 'recursion:' + entry),
      unverified: [],
      writes: [],
      source_intelligence_refs: agent.source_intelligence_refs || null,
      goal_mode_ref: agent.goal_mode_ref || null
    })
  }
  if (!opts.command) {
    return validateAgentWorkerResult({
      mission_id: opts.missionId || opts.mission_id || '',
      agent_id: agent.id,
      session_id: agent.session_id,
      persona_id: agent.persona_id || agent.id,
      task_slice_id: slice?.id || '',
      status: 'done',
      backend: 'process',
      summary: 'Process backend dry run for ' + (slice?.id || agent.id) + '.',
      artifacts: [],
      blockers: [],
      unverified: ['no process command supplied'],
      writes: [],
      source_intelligence_refs: agent.source_intelligence_refs || null,
      goal_mode_ref: agent.goal_mode_ref || null
    })
  }
  const result = await runProcess(opts.command[0], opts.command.slice(1), { cwd: opts.cwd || process.cwd(), env: opts.env, timeoutMs: opts.timeoutMs || 30000, maxOutputBytes: 128 * 1024 })
  const report = await writeAgentProcessReport(opts.agentRoot || opts.cwd || process.cwd(), agent, 'process', {
    command: opts.command,
    pid: result.pid || null,
    exit_code: result.code,
    stdout_tail: result.stdout,
    stderr_tail: result.stderr,
    stdout_bytes: result.stdoutBytes,
    stderr_bytes: result.stderrBytes,
    truncated: result.truncated,
    timed_out: result.timedOut
  })
  return validateAgentWorkerResult({
    mission_id: opts.missionId || opts.mission_id || '',
    agent_id: agent.id,
    session_id: agent.session_id,
    persona_id: agent.persona_id || agent.id,
    task_slice_id: slice?.id || '',
    status: result.code === 0 ? 'done' : 'failed',
    backend: 'process',
    summary: result.stdout.slice(-1000) || result.stderr.slice(-1000),
    artifacts: [report],
    blockers: result.code === 0 ? [] : ['process_exit_' + result.code],
    unverified: [],
    writes: [],
    source_intelligence_refs: agent.source_intelligence_refs || null,
    goal_mode_ref: agent.goal_mode_ref || null
  })
}

async function writeAgentProcessReport(root: string, agent: any, backend: string, report: any) {
  const rel = path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-process-report.json')
  await writeJsonAtomic(path.join(root, rel), { schema: 'sks.agent-process-report.v1', backend, agent_id: agent.id, session_id: agent.session_id, ...report })
  return rel
}

function scanCommandForRecursion(command: string[]) {
  const joined = command.map((part) => String(part)).join(' ')
  return scanAgentTextForRecursion(joined)
}

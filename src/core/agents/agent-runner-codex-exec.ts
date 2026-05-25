import path from 'node:path'
import { readJson, runProcess, writeJsonAtomic } from '../fsx.js'
import { agentWorkerEnv, validateAgentWorkerResult } from './agent-worker-pipeline.js'

export function buildCodexExecAgentArgs(agent: any, prompt: string, opts: any = {}) {
  const resultFile = opts.resultFile || path.join(opts.cwd || process.cwd(), agent.session_id + '-agent-result.json')
  const sandbox = opts.workspaceWrite ? 'workspace-write' : 'read-only'
  return {
    resultFile,
    args: [
      'exec',
      '--json',
      '--output-schema',
      opts.schemaFile || 'schemas/codex/agent-result.schema.json',
      '--output-last-message',
      resultFile,
      '--ephemeral',
      '--ignore-user-config',
      '--ignore-rules',
      '--sandbox',
      sandbox,
      prompt
    ]
  }
}

export async function runCodexExecAgent(agent: any, slice: any, opts: any = {}) {
  if (opts.outputSchemaSupported === false) {
    return validateAgentWorkerResult({ mission_id: opts.missionId || opts.mission_id || '', agent_id: agent.id, session_id: agent.session_id, persona_id: agent.persona_id || agent.id, task_slice_id: slice?.id || '', status: 'blocked', backend: 'codex-exec', summary: 'Codex exec output schema support was not verified.', artifacts: [], blockers: ['codex_exec_output_schema_unsupported'], unverified: [], writes: [], source_intelligence_refs: agent.source_intelligence_refs || null, goal_mode_ref: agent.goal_mode_ref || null })
  }
  if (opts.dryRun !== false) {
    const command = buildCodexExecAgentArgs(agent, opts.prompt || slice?.description || '', opts)
    const report = await writeCodexProcessReport(opts.agentRoot || opts.cwd || process.cwd(), agent, {
      command: [opts.codexBin || 'codex', ...command.args],
      pid: null,
      exit_code: null,
      stdout_log: null,
      stderr_log: null,
      dry_run: true
    })
    return validateAgentWorkerResult({ mission_id: opts.missionId || opts.mission_id || '', agent_id: agent.id, session_id: agent.session_id, persona_id: agent.persona_id || agent.id, task_slice_id: slice?.id || '', status: 'done', backend: 'codex-exec', summary: 'Codex exec command prepared for ' + agent.id + '.', findings: ['codex exec command prepared'], proposed_changes: [], changed_files: [], lease_compliance: { ok: true, violations: [] }, artifacts: [command.resultFile, report], blockers: [], confidence: 'verified_partial', handoff_notes: 'Dry-run did not launch Codex exec.', unverified: ['codex-exec dry-run command was not launched'], writes: [], source_intelligence_refs: agent.source_intelligence_refs || null, goal_mode_ref: agent.goal_mode_ref || null, verification: { status: 'dry_run', checks: ['codex-exec-args-built'] } })
  }
  const command = buildCodexExecAgentArgs(agent, opts.prompt || slice?.description || '', opts)
  const logRoot = path.join(opts.agentRoot || opts.cwd || process.cwd(), agent.session_artifact_dir || path.join('sessions', agent.id))
  const stdoutFile = path.join(logRoot, 'codex-exec.stdout.log')
  const stderrFile = path.join(logRoot, 'codex-exec.stderr.log')
  const allowedCommandsFile = path.join(opts.agentRoot || opts.cwd || process.cwd(), 'agent-allowed-commands.json')
  const workerEnv = agentWorkerEnv(agent, allowedCommandsFile)
  const result = await runProcess(opts.codexBin || 'codex', command.args, { cwd: opts.cwd || process.cwd(), env: { ...(opts.env || {}), ...workerEnv }, timeoutMs: opts.timeoutMs || 30 * 60 * 1000, maxOutputBytes: 256 * 1024, stdoutFile, stderrFile })
  const report = await writeCodexProcessReport(opts.agentRoot || opts.cwd || process.cwd(), agent, {
    command: [opts.codexBin || 'codex', ...command.args],
    pid: result.pid || null,
    exit_code: result.code,
    stdout_log: path.relative(opts.agentRoot || opts.cwd || process.cwd(), stdoutFile),
    stderr_log: path.relative(opts.agentRoot || opts.cwd || process.cwd(), stderrFile),
    stdout_tail: result.stdout,
    stderr_tail: result.stderr,
    stdout_bytes: result.stdoutBytes,
    stderr_bytes: result.stderrBytes,
    truncated: result.truncated,
    timed_out: result.timedOut,
    dry_run: false
  })
  if (result.code === 0) {
    const parsed = await readJson<any>(command.resultFile, null).catch(() => null)
    if (parsed) {
      const validated = validateAgentWorkerResult({ ...parsed, mission_id: parsed.mission_id || opts.missionId || opts.mission_id || '', agent_id: parsed.agent_id || agent.id, session_id: parsed.session_id || agent.session_id, persona_id: parsed.persona_id || agent.persona_id || agent.id, task_slice_id: parsed.task_slice_id || slice?.id || '', backend: 'codex-exec', source_intelligence_refs: parsed.source_intelligence_refs || agent.source_intelligence_refs || null, goal_mode_ref: parsed.goal_mode_ref || agent.goal_mode_ref || null, artifacts: [...(Array.isArray(parsed.artifacts) ? parsed.artifacts : []), command.resultFile, report], verification: { status: parsed.verification?.status || 'passed', checks: [...(Array.isArray(parsed.verification?.checks) ? parsed.verification.checks : []), 'codex-exec-output-last-message', 'agent-result-schema'] } })
      if (!validated.blockers.some((blocker: string) => blocker.startsWith('schema_invalid:'))) return validated
      return { ...validated, status: 'blocked', blockers: [...validated.blockers, 'codex_exec_result_schema_invalid'] }
    }
  }
  return validateAgentWorkerResult({ mission_id: opts.missionId || opts.mission_id || '', agent_id: agent.id, session_id: agent.session_id, persona_id: agent.persona_id || agent.id, task_slice_id: slice?.id || '', status: result.code === 0 ? 'done' : 'failed', backend: 'codex-exec', summary: result.stdout.slice(-1000) || result.stderr.slice(-1000), artifacts: [command.resultFile, report], blockers: result.code === 0 ? ['codex_exec_output_last_message_missing_or_invalid'] : ['codex_exec_exit_' + result.code], confidence: 'verified_partial', unverified: result.code === 0 ? ['codex-exec stdout fallback; resultFile JSON missing or invalid'] : [], writes: [], source_intelligence_refs: agent.source_intelligence_refs || null, goal_mode_ref: agent.goal_mode_ref || null, verification: { status: result.code === 0 ? 'partial' : 'failed', checks: ['codex-exec-exit-code', 'codex-exec-process-report', 'codex-exec-output-last-message'] } })
}

async function writeCodexProcessReport(root: string, agent: any, report: any) {
  const rel = path.join(agent.session_artifact_dir || path.join('sessions', agent.id), 'agent-process-report.json')
  await writeJsonAtomic(path.join(root, rel), { schema: 'sks.agent-process-report.v1', backend: 'codex-exec', agent_id: agent.id, session_id: agent.session_id, ...report })
  return rel
}

import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess, type RunProcessResult } from '../fsx.js'
import {
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL
} from './model-policy.js'

export const OFFICIAL_SUBAGENT_WORKFLOW_SCHEMA = 'sks.subagent-workflow.v1'

export interface OfficialSubagentWorkflowInput {
  root: string
  prompt: string
  requestedSubagents: number
  maxThreads: number
  appSession: boolean
  missionId?: string | null
  sessionKey?: string | null
  codexBin?: string | null
  timeoutMs?: number | null
  env?: NodeJS.ProcessEnv
  runProcessImpl?: typeof runProcess
}

export function detectCodexAppSession(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.SKS_NARUTO_STANDALONE_CLI === '1') return false
  if (env.SKS_NARUTO_APP_SESSION === '1') return true
  return Boolean(env.CODEX_THREAD_ID)
}

export function codexAppSessionKey(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!detectCodexAppSession(env)) return null
  const threadId = String(env.CODEX_THREAD_ID || '').trim()
  return threadId || null
}

export function buildOfficialSubagentCodexArgs(input: {
  prompt: string
  maxThreads: number
  parentSummaryFile: string
}): string[] {
  return [
    'exec',
    '-m', NARUTO_PARENT_MODEL,
    '-c', `model_reasoning_effort="${NARUTO_PARENT_EFFORT}"`,
    '-c', `agents.max_threads=${Math.max(1, Math.floor(input.maxThreads))}`,
    '-c', 'agents.max_depth=1',
    '--output-last-message', input.parentSummaryFile,
    input.prompt
  ]
}

export async function runOfficialSubagentWorkflow(input: OfficialSubagentWorkflowInput): Promise<any> {
  const base = {
    schema: OFFICIAL_SUBAGENT_WORKFLOW_SCHEMA,
    workflow: 'official_codex_subagent',
    requested_subagents: input.requestedSubagents,
    max_threads: input.maxThreads,
    max_depth: 1,
    parent_model: NARUTO_PARENT_MODEL,
    parent_reasoning_effort: NARUTO_PARENT_EFFORT,
    session_scope: input.sessionKey || null,
    legacy_process_swarm_used: false
  }

  if (input.appSession) {
    return {
      ...base,
      ok: false,
      status: 'delegation_context_ready',
      prepared: true,
      additionalContext: input.prompt,
      completion_evidence: false,
      note: 'The current Codex parent must spawn and await the official subagents. Preparation is not completion evidence.'
    }
  }

  const parentSummaryFile = path.join(os.tmpdir(), `sks-naruto-parent-summary-${process.pid}-${Date.now()}.txt`)
  await fsp.mkdir(path.dirname(parentSummaryFile), { recursive: true })
  const args = buildOfficialSubagentCodexArgs({
    prompt: input.prompt,
    maxThreads: input.maxThreads,
    parentSummaryFile
  })
  const execute = input.runProcessImpl || runProcess
  let processResult: RunProcessResult
  try {
    processResult = await execute(input.codexBin || 'codex', args, {
      cwd: input.root,
      timeoutMs: input.timeoutMs || 60 * 60 * 1000,
      maxOutputBytes: 256 * 1024,
      env: {
        ...(input.env || {}),
        SKS_NARUTO_STANDALONE_CLI: '0',
        SKS_NARUTO_PARENT_LAUNCH: '1',
        ...(input.missionId ? { SKS_NARUTO_PARENT_MISSION_ID: input.missionId } : {})
      }
    })
  } catch (error: any) {
    processResult = {
      code: -1,
      stdout: '',
      stderr: String(error?.message || error),
      stdoutBytes: 0,
      stderrBytes: 0,
      truncated: false,
      timedOut: false
    }
  }
  const parentSummary = await fsp.readFile(parentSummaryFile, 'utf8').catch(() => '')
  await fsp.rm(parentSummaryFile, { force: true }).catch(() => undefined)

  return {
    ...base,
    ok: processResult.code === 0,
    status: processResult.code === 0 ? 'parent_completed' : 'parent_failed',
    codex_exit_code: processResult.code,
    parent_summary: parentSummary.trim() || null,
    parent_summary_file: null,
    process: {
      pid: processResult.pid || null,
      timed_out: processResult.timedOut,
      stdout_tail: processResult.stdout,
      stderr_tail: processResult.stderr,
      output_truncated: processResult.truncated
    },
    completion_evidence: false
  }
}

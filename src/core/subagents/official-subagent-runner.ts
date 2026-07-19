import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { runProcess, type RunProcessResult } from '../fsx.js'
import {
  NARUTO_PARENT_EFFORT,
  NARUTO_PARENT_MODEL
} from './model-policy.js'
import { inspectCodexLbCliLaunchRecovery } from '../codex-control/codex-lb-launch-recovery.js'
import { resolveOfficialCodexPackageRuntime } from '../codex-runtime/resolve-codex-runtime.js'
import {
  createHostCapabilityEventCollector,
  hostCapabilityCodexConfigArgs,
  inspectHostCapabilityRuntime,
  requestHostCapabilities,
  type HostCapabilityRuntimeDependencies
} from '../agent-bridge/host-capability-runtime.js'

export const OFFICIAL_SUBAGENT_WORKFLOW_SCHEMA = 'sks.subagent-workflow.v1'

const OFFICIAL_SUBAGENT_CHILD_ENV_ALLOWLIST = Object.freeze([
  'HOME',
  'USER',
  'LOGNAME',
  'SHELL',
  'PATH',
  'TMPDIR',
  'TMP',
  'TEMP',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'TERM',
  'COLORTERM',
  'NO_COLOR',
  'FORCE_COLOR',
  'XDG_CONFIG_HOME',
  'XDG_CACHE_HOME',
  'XDG_DATA_HOME',
  'SystemRoot',
  'WINDIR',
  'COMSPEC',
  'PATHEXT',
  'USERPROFILE',
  'HOMEDRIVE',
  'HOMEPATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'NODE_EXTRA_CA_CERTS',
  'CODEX_HOME',
  'CODEX_CI',
  'CODEX_MANAGED_BY_NPM',
  'CODEX_INTERNAL_ORIGINATOR',
  'CODEX_SANDBOX_NETWORK_DISABLED',
  'SKS_AGENT_MODE',
  'ACAS_AGENT_SLUG',
  'ACAS_AGENT_WORKSPACE',
  'ALFREDO_AGENT_SOULS_FILE',
  'ACAS_CHROME_PATH',
  'ACAS_HTML_TO_PDF_ENGINE',
  'ACAS_HTML_TO_PDF_ALLOW_CHROME_CLI_FALLBACK'
] as const)

const SECRET_ENV_KEY_RE = /(?:api[_-]?key|token|secret|password|credential|authorization|cookie)/i
const SECRET_BEARING_ENV_KEYS = new Set([
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy'
])

export interface OfficialSubagentWorkflowInput {
  root: string
  goal: string
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
  onChildSpawn?: (pid: number) => void | Promise<void>
  hostCapabilityDependencies?: HostCapabilityRuntimeDependencies
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
  hostCapabilityConfigArgs?: readonly string[]
}): string[] {
  return [
    'exec',
    '--json',
    '-m', NARUTO_PARENT_MODEL,
    '-c', `model_reasoning_effort="${NARUTO_PARENT_EFFORT}"`,
    '-c', 'model_provider="openai"',
    '-c', 'forced_login_method="chatgpt"',
    '-c', `agents.max_threads=${Math.max(1, Math.floor(input.maxThreads))}`,
    '-c', 'agents.max_depth=1',
    ...(input.hostCapabilityConfigArgs || []),
    '--output-last-message', input.parentSummaryFile,
    input.prompt
  ]
}

export function buildOfficialSubagentChildEnv(input: {
  env?: NodeJS.ProcessEnv
  missionId?: string | null
} = {}): NodeJS.ProcessEnv {
  const source = { ...process.env, ...(input.env || {}) }
  const childEnv: NodeJS.ProcessEnv = {}
  for (const key of OFFICIAL_SUBAGENT_CHILD_ENV_ALLOWLIST) {
    if (source[key] !== undefined) childEnv[key] = source[key]
  }
  childEnv.SKS_NARUTO_STANDALONE_CLI = '0'
  childEnv.SKS_NARUTO_PARENT_LAUNCH = '1'
  if (input.missionId) childEnv.SKS_NARUTO_PARENT_MISSION_ID = input.missionId
  return childEnv
}

function knownInheritedSecretValues(env: NodeJS.ProcessEnv | undefined): string[] {
  const source = { ...process.env, ...(env || {}) }
  return [...new Set(Object.entries(source)
    .filter(([key, value]) => String(value || '').length >= 8 && (SECRET_ENV_KEY_RE.test(key) || SECRET_BEARING_ENV_KEYS.has(key)))
    .map(([, value]) => String(value)))]
    .sort((a, b) => b.length - a.length)
}

function redactKnownValues(text: string, values: readonly string[]): string {
  let redacted = text
  for (const value of values) redacted = redacted.split(value).join('<redacted>')
  return redacted
}

export async function runOfficialSubagentWorkflow(input: OfficialSubagentWorkflowInput): Promise<any> {
  const hostCapabilityRequest = requestHostCapabilities(input.goal)
  const base = {
    schema: OFFICIAL_SUBAGENT_WORKFLOW_SCHEMA,
    workflow: 'official_codex_subagent',
    requested_subagents: input.requestedSubagents,
    max_threads: input.maxThreads,
    max_depth: 1,
    parent_model: NARUTO_PARENT_MODEL,
    parent_reasoning_effort: NARUTO_PARENT_EFFORT,
    session_scope: input.sessionKey || null,
    host_capability_request: hostCapabilityRequest
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

  const childEnv = buildOfficialSubagentChildEnv({
    ...(input.env ? { env: input.env } : {}),
    ...(input.missionId ? { missionId: input.missionId } : {})
  })
  const inheritedSecretValues = knownInheritedSecretValues(input.env)
  const parentSummaryFile = path.join(os.tmpdir(), `sks-naruto-parent-summary-${process.pid}-${Date.now()}.txt`)
  const hostCapabilityRuntime = await inspectHostCapabilityRuntime({
    root: input.root,
    request: hostCapabilityRequest,
    ...(input.hostCapabilityDependencies ? { dependencies: input.hostCapabilityDependencies } : {})
  })
  const hostCapabilityCollector = createHostCapabilityEventCollector(hostCapabilityRuntime)
  if (!hostCapabilityRuntime.ok) {
    const hostCapabilityEvidence = hostCapabilityCollector.finish()
    return {
      ...base,
      ok: false,
      status: 'host_capability_blocked',
      prepared: false,
      codex_exit_code: null,
      parent_summary: null,
      parent_summary_file: null,
      host_capability_runtime: hostCapabilityRuntime,
      host_capability_evidence: hostCapabilityEvidence,
      blockers: hostCapabilityEvidence.blockers,
      completion_evidence: false
    }
  }
  const args = buildOfficialSubagentCodexArgs({
    prompt: input.prompt,
    maxThreads: input.maxThreads,
    parentSummaryFile,
    hostCapabilityConfigArgs: hostCapabilityCodexConfigArgs(hostCapabilityRuntime)
  })
  const toolOutputRecovery = await inspectCodexLbCliLaunchRecovery({
    root: input.root,
    env: childEnv,
    cliArgs: args.slice(0, -1)
  })
  if (!toolOutputRecovery.ok) {
    return {
      ...base,
      ok: false,
      status: 'tool_output_recovery_blocked',
      prepared: false,
      codex_exit_code: null,
      parent_summary: null,
      parent_summary_file: null,
      host_capability_runtime: hostCapabilityRuntime,
      host_capability_evidence: hostCapabilityCollector.finish(),
      tool_output_recovery: toolOutputRecovery,
      blockers: toolOutputRecovery.blockers,
      operator_actions: toolOutputRecovery.operator_actions,
      completion_evidence: false
    }
  }

  let codexCommand: string
  if (input.runProcessImpl) {
    codexCommand = input.codexBin || 'codex'
  } else {
    if (input.codexBin) {
      return {
        ...base,
        ok: false,
        status: 'trusted_runtime_blocked',
        prepared: false,
        codex_exit_code: null,
        parent_summary: null,
        parent_summary_file: null,
        host_capability_runtime: hostCapabilityRuntime,
        host_capability_evidence: hostCapabilityCollector.finish(),
        tool_output_recovery: toolOutputRecovery,
        blockers: ['codex_parent_executable_override_forbidden'],
        completion_evidence: false
      }
    }
    const runtime = await resolveOfficialCodexPackageRuntime({ requestedBy: 'official-subagent-runner' })
    if (!runtime.ok || !runtime.identity) {
      return {
        ...base,
        ok: false,
        status: 'trusted_runtime_blocked',
        prepared: false,
        codex_exit_code: null,
        parent_summary: null,
        parent_summary_file: null,
        host_capability_runtime: hostCapabilityRuntime,
        host_capability_evidence: hostCapabilityCollector.finish(),
        tool_output_recovery: toolOutputRecovery,
        blockers: [...runtime.blockers],
        completion_evidence: false
      }
    }
    codexCommand = runtime.identity.realpath
  }

  await fsp.mkdir(path.dirname(parentSummaryFile), { recursive: true })
  const execute = input.runProcessImpl || runProcess
  let processResult: RunProcessResult
  try {
    processResult = await execute(codexCommand, args, {
      cwd: input.root,
      timeoutMs: input.timeoutMs || 60 * 60 * 1000,
      maxOutputBytes: 256 * 1024,
      env: childEnv,
      envMode: 'replace',
      onStdout: hostCapabilityCollector.push,
      ...(input.onChildSpawn ? { onSpawn: input.onChildSpawn } : {})
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
  const parentSummary = redactKnownValues(
    await fsp.readFile(parentSummaryFile, 'utf8').catch(() => ''),
    inheritedSecretValues
  )
  await fsp.rm(parentSummaryFile, { force: true }).catch(() => undefined)
  const hostCapabilityEvidence = hostCapabilityCollector.finish(processResult.stdout)
  const stdout = summarizeCodexJsonlOutput(processResult.stdout, inheritedSecretValues)
  const stderr = redactKnownValues(processResult.stderr, inheritedSecretValues).slice(-12_000)
  const blockers = uniqueStrings([
    ...(processResult.spawnRegistrationFailed === true
      ? ['codex_parent_spawn_registration_failed']
      : processResult.timedOut
        ? ['codex_parent_timeout']
        : processResult.code === 0
          ? []
          : ['codex_parent_exit:' + String(processResult.code ?? 'unknown')]),
    ...hostCapabilityEvidence.blockers
  ])
  const ok = processResult.code === 0 && hostCapabilityEvidence.ok
  const status = processResult.code !== 0
    ? 'parent_failed'
    : hostCapabilityEvidence.ok
      ? 'parent_completed'
      : 'host_capability_blocked'

  return {
    ...base,
    ok,
    status,
    codex_exit_code: processResult.code,
    parent_summary: parentSummary.trim() || null,
    parent_summary_file: null,
    blockers,
    host_capability_runtime: hostCapabilityRuntime,
    host_capability_evidence: hostCapabilityEvidence,
    tool_output_recovery: toolOutputRecovery,
    process: {
      pid: processResult.pid || null,
      timed_out: processResult.timedOut,
      stdout_tail: stdout.tail,
      stderr_tail: stderr,
      jsonl_event_count: stdout.event_count,
      jsonl_event_types: stdout.event_types,
      output_truncated: processResult.truncated
    },
    completion_evidence: false
  }
}

function summarizeCodexJsonlOutput(text: string, secretValues: readonly string[]): {
  tail: string
  event_count: number
  event_types: string[]
} {
  const redacted = redactKnownValues(String(text || ''), secretValues)
  const eventTypes: string[] = []
  let eventCount = 0
  for (const line of redacted.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      eventCount += 1
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const type = String((parsed as Record<string, unknown>).type || '').trim()
        if (type) eventTypes.push(type)
      }
      continue
    } catch {}
  }
  return {
    // `codex exec --json` stdout is an evidence stream. Even an apparently
    // non-JSON tail can be a truncated JSONL tool-call record, so never return
    // raw stdout content from this path.
    tail: '',
    event_count: eventCount,
    event_types: uniqueStrings(eventTypes)
  }
}

function uniqueStrings(values: readonly unknown[]): string[] {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))].sort()
}

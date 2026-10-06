import path from 'node:path'
import { writeJsonAtomic } from '../fsx.js'

export const AGENT_RECURSION_GUARD_REPORT_SCHEMA = 'sks.agent-recursion-guard.v1'

export const AGENT_RECURSIVE_COMMAND_DENYLIST = Object.freeze([
  'sks naruto run',
  'sks research run',
  'sks autoresearch run',
  'sks qa-loop',
  'sks goal',
  '$Naruto',
  '$Work',
  '$Research',
  '$AutoResearch',
  '$QA-LOOP',
  '$Goal',
  'node dist/bin/sks.js naruto',
  'node dist/bin/sks.js research run'
])


const DENY_PATTERNS = AGENT_RECURSIVE_COMMAND_DENYLIST.map((entry) =>
  entry.startsWith('$')
    ? new RegExp('(^|\\s)\\' + entry + '(\\s|$)', 'i')
    : new RegExp('(^|\\s)' + escapeRe(entry).replace(/\\ /g, '\\s+') + '(\\s|$)', 'i')
)

export function scanAgentTextForRecursion(text: unknown) {
  const body = String(text || '')
  const violations = AGENT_RECURSIVE_COMMAND_DENYLIST.filter((entry, index) => DENY_PATTERNS[index]?.test(body))
  return {
    ok: violations.length === 0,
    violations,
    warning: violations.length ? 'agent_worker_recursion_attempt_blocked' : null
  }
}

export function agentWorkerHookRecursionDecision(state: any = {}, payload: any = {}, command: any = '') {
  if (!agentWorkerHookContext(state, payload)) return null
  const guard = scanAgentTextForRecursion(command)
  if (guard.ok) return null
  return {
    decision: 'block',
    permissionDecision: 'deny',
    reason: `Agent command recursion guard blocked nested SKS route command in Codex PreToolUse hook: ${guard.violations.join(', ')}`
  }
}

/**
 * True when this hook is running inside an agent worker.
 *
 * The marker is a *process* environment variable: `native-cli-worker-runtime`
 * sets `SKS_AGENT_WORKER=1` on the worker it spawns, and every descendant
 * inherits it. Reading only the tool-call payload made this unreachable in
 * practice — an agent that runs `sks naruto run` through its shell has no
 * reason to redeclare that variable in the tool input, so the guard returned
 * false at exactly the moment it was needed and nested fan-out went unbounded.
 *
 * Both sources are consulted now. The payload still counts, because a caller
 * that explicitly declares the worker env for a child is telling the truth
 * about that child; the ambient environment counts because it is what the
 * spawner actually set.
 */
export function agentWorkerHookContext(
  state: any = {},
  payload: any = {},
  env: NodeJS.ProcessEnv = process.env
) {
  const declared = {
    ...(env || {}),
    ...(payload.env || {}),
    ...(payload.tool_input?.env || {}),
    ...(payload.toolInput?.env || {}),
    ...(payload.input?.env || {}),
    ...(payload.tool?.input?.env || {})
  }
  void state
  return Boolean(String(declared.SKS_AGENT_WORKER || '') === '1'
    || String(declared.SKS_DISABLE_ROUTE_RECURSION || '') === '1'
    || agentGenerationDepth(declared) > 0
    || payload.agent_worker === true
    || payload.agentWorker === true)
}

/**
 * How many agent generations deep this process already is.
 *
 * A boolean marker only answers "am I inside an agent". It cannot bound how far
 * nesting goes, and it is lost the moment one boundary forgets to forward it. A
 * counter degrades safely instead: an unreadable or absent value reads as depth
 * 0, but every level that does forward it makes the next level harder to reach.
 */
export function agentGenerationDepth(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt(String(env[AGENT_GENERATION_DEPTH_ENV] || ''), 10)
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_AGENT_GENERATION_DEPTH * 4) : 0
}

/** Env carrying the nesting depth across every spawn boundary. */
export const AGENT_GENERATION_DEPTH_ENV = 'SKS_AGENT_GENERATION_DEPTH' as const

/**
 * One parent and the workers it spawns. A worker that spawns its own fan-out is
 * the multiplication this guard exists to stop, so depth 2 is already refused.
 */
export const MAX_AGENT_GENERATION_DEPTH = 1

export function nextAgentGenerationEnv(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  return { [AGENT_GENERATION_DEPTH_ENV]: String(agentGenerationDepth(env) + 1) }
}

export async function writeAgentRecursionGuardReport(dir: string, input: unknown) {
  const result = scanAgentTextForRecursion(input)
  const report = {
    schema: AGENT_RECURSION_GUARD_REPORT_SCHEMA,
    ok: result.ok,
    violations: result.violations,
    blocks_proof: !result.ok
  }
  await writeJsonAtomic(path.join(dir, 'agent-recursion-guard.json'), report)
  return report
}

function escapeRe(value: string) {
  return value.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')
}

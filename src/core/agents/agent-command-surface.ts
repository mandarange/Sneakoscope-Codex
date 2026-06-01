import { DEFAULT_AGENT_COUNT } from './agent-schema.js'
import { normalizeServiceTier } from './fast-mode-policy.js'

export function parseAgentCommandArgs(command: string, args: string[] = []) {
  const first = args[0] && !String(args[0]).startsWith('--') ? String(args[0]) : ''
  const actions = new Set(['run', 'worker', 'status', 'plan', 'spawn', 'watch', 'dashboard', 'cockpit', 'lane', 'board', 'ledger', 'collect', 'consensus', 'close', 'cleanup', 'proof', 'explain', 'rollback-patches'])
  const action = actions.has(first) ? first : 'run'
  const rest = action === first ? args.slice(1) : args
  const json = hasFlag(args, '--json')
  const agents = Number(readOption(args, '--agents', DEFAULT_AGENT_COUNT))
  const targetActiveSlots = Number(readOption(args, '--target-active-slots', agents))
  const desiredWorkItemCount = Number(readOption(args, '--work-items', targetActiveSlots))
  const minimumWorkItems = Number(readOption(args, '--minimum-work-items', targetActiveSlots))
  const maxQueueExpansion = Number(readOption(args, '--max-queue-expansion', 10))
  const concurrency = Number(readOption(args, '--concurrency', Math.min(agents, 5)))
  const backend = String(readOption(args, '--backend', hasFlag(args, '--mock') ? 'fake' : 'codex-exec'))
  const route = String(readOption(args, '--route', '$Agent'))
  const mock = hasFlag(args, '--mock') || backend === 'fake'
  const real = hasFlag(args, '--real')
  const readonly = hasFlag(args, '--readonly') || hasFlag(args, '--read-only')
  const profile = String(readOption(args, '--profile', '') || '') || null
  const writeMode = String(readOption(args, '--write-mode', hasFlag(args, '--parallel-write') ? 'parallel' : 'off')) as 'proof-safe' | 'parallel' | 'serial' | 'off'
  const applyPatches = hasFlag(args, '--apply-patches')
  const dryRunPatches = hasFlag(args, '--dry-run-patches') || hasFlag(args, '--dryrun-patches')
  const maxWriteAgents = Number(readOption(args, '--max-write-agents', Math.max(1, Math.min(concurrency, agents))))
  const explicitServiceTier = String(readOption(args, '--service-tier', '') || '')
  const serviceTier = normalizeServiceTier(explicitServiceTier, null) || undefined
  const fastMode = hasFlag(args, '--no-fast') || serviceTier === 'standard' ? false : hasFlag(args, '--fast') ? true : undefined
  const noFast = hasFlag(args, '--no-fast')
  const apply = hasFlag(args, '--apply')
  const dryRun = hasFlag(args, '--dry-run') || hasFlag(args, '--dryrun')
  const drain = hasFlag(args, '--drain')
  const staleMs = Number(readOption(args, '--stale-ms', 30 * 60 * 1000))
  const graceMs = Number(readOption(args, '--grace-ms', 750))
  const killEscalation = hasFlag(args, '--kill-escalation') || !hasFlag(args, '--no-kill-escalation')
  const codexApp = hasFlag(args, '--codex-app')
  const positionals = positionalArgs(rest, new Set(['--agents', '--target-active-slots', '--work-items', '--minimum-work-items', '--max-queue-expansion', '--concurrency', '--backend', '--route', '--mission', '--mission-id', '--agent', '--lane', '--stale-ms', '--grace-ms', '--profile', '--write-mode', '--max-write-agents', '--patch-entry-id', '--patch-entry', '--service-tier', '--intake', '--agent-root', '--artifact-dir', '--result-path', '--heartbeat-path', '--patch-envelope-path']))
  const missionDefault = action === 'run' || action === 'spawn' || action === 'plan' ? '' : 'latest'
  const positionalMission = action === 'run' || action === 'spawn' || action === 'plan' ? '' : (positionals[0] || '')
  const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', positionalMission || missionDefault)))
  const lane = String(readOption(args, '--agent', readOption(args, '--lane', '')))
  const patchEntryId = String(readOption(args, '--patch-entry-id', readOption(args, '--patch-entry', '')))
  const promptPositionals = positionalMission ? positionals.slice(1) : positionals
  const prompt = promptPositionals.join(' ').trim() || 'Native agent run'
  return { command, action, prompt, route, agents, targetActiveSlots, desiredWorkItemCount, minimumWorkItems, maxQueueExpansion, concurrency, backend, mock, real, readonly, profile, writeMode, applyPatches, dryRunPatches, maxWriteAgents, fastMode, serviceTier, noFast, apply, dryRun, drain, staleMs, graceMs, killEscalation, json, missionId, lane, codexApp, patchEntryId }
}

function hasFlag(args: string[], flag: string) {
  return args.includes(flag)
}

function readOption(args: string[], name: string, fallback: unknown) {
  const index = args.indexOf(name)
  if (index >= 0 && args[index + 1] && !String(args[index + 1]).startsWith('--')) return args[index + 1]
  const prefixed = args.find((arg) => String(arg).startsWith(name + '='))
  return prefixed ? prefixed.slice(name.length + 1) : fallback
}

function positionalArgs(args: string[], valueFlags: Set<string>) {
  const out: string[] = []
  for (let i = 0; i < args.length; i += 1) {
    const arg = String(args[i])
    if (arg.startsWith('--')) {
      if (valueFlags.has(arg) && args[i + 1] && !String(args[i + 1]).startsWith('--')) i += 1
      continue
    }
    out.push(arg)
  }
  return out
}

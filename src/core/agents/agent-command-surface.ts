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
  const useOllamaProtocol = hasFlag(args, '--ollama')
  const useLocalModel = hasFlag(args, '--local-model')
  const useOllama = useOllamaProtocol || useLocalModel
  const noOllama = hasFlag(args, '--no-ollama') || hasFlag(args, '--no-local-model')
  const backendExplicit = hasOption(args, '--backend') || useOllamaProtocol || useLocalModel || noOllama
  const defaultBackend = hasFlag(args, '--mock')
    ? 'fake'
    : useLocalModel && !noOllama
      ? 'local-llm'
      : useOllamaProtocol && !noOllama
        ? 'ollama'
        : 'codex-sdk'
  const backend = String(readOption(args, '--backend', defaultBackend))
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
  const ollamaModel = String(readOption(args, '--ollama-model', readOption(args, '--local-model-model', '')) || '') || null
  const ollamaBaseUrl = String(readOption(args, '--ollama-base-url', readOption(args, '--local-model-base-url', '')) || '') || null
  const zellijSessionName = String(readOption(args, '--zellij-session-name', '') || '') || null
  const zellijPaneWorker = hasFlag(args, '--no-zellij-pane-worker') ? false : hasFlag(args, '--zellij-pane-worker') ? true : undefined
  const workerPlacement = String(readOption(args, '--worker-placement', zellijPaneWorker === true ? 'zellij-pane' : '') || '') || undefined
  const zellijVisiblePaneCap = resolveZellijVisiblePaneCap(
    readOption(args, '--zellij-visible-pane-cap', process.env.SKS_ZELLIJ_VISIBLE_PANE_CAP || ''),
    hasOption(args, '--zellij-visible-pane-cap') || Boolean(process.env.SKS_ZELLIJ_VISIBLE_PANE_CAP)
  )
  const apply = hasFlag(args, '--apply')
  const dryRun = hasFlag(args, '--dry-run') || hasFlag(args, '--dryrun')
  const drain = hasFlag(args, '--drain')
  const staleMs = Number(readOption(args, '--stale-ms', 30 * 60 * 1000))
  const graceMs = Number(readOption(args, '--grace-ms', 750))
  const killEscalation = hasFlag(args, '--kill-escalation') || !hasFlag(args, '--no-kill-escalation')
  const codexApp = hasFlag(args, '--codex-app')
  const positionals = positionalArgs(rest, new Set(['--agents', '--target-active-slots', '--work-items', '--minimum-work-items', '--max-queue-expansion', '--concurrency', '--backend', '--route', '--mission', '--mission-id', '--agent', '--lane', '--stale-ms', '--grace-ms', '--profile', '--write-mode', '--max-write-agents', '--patch-entry-id', '--patch-entry', '--service-tier', '--zellij-session-name', '--worker-placement', '--zellij-visible-pane-cap', '--intake', '--agent-root', '--artifact-dir', '--result-path', '--heartbeat-path', '--patch-envelope-path', '--ollama-model', '--local-model-model', '--ollama-base-url', '--local-model-base-url']))
  const missionDefault = action === 'run' || action === 'spawn' || action === 'plan' ? '' : 'latest'
  const positionalMission = action === 'run' || action === 'spawn' || action === 'plan' ? '' : (positionals[0] || '')
  const missionId = String(readOption(args, '--mission', readOption(args, '--mission-id', positionalMission || missionDefault)))
  const lane = String(readOption(args, '--agent', readOption(args, '--lane', '')))
  const patchEntryId = String(readOption(args, '--patch-entry-id', readOption(args, '--patch-entry', '')))
  const promptPositionals = positionalMission ? positionals.slice(1) : positionals
  const promptExplicit = promptPositionals.length > 0
  const prompt = promptPositionals.join(' ').trim() || 'Native agent run'
  return { command, action, prompt, promptExplicit, route, agents, targetActiveSlots, desiredWorkItemCount, minimumWorkItems, maxQueueExpansion, concurrency, backend, backendExplicit, mock, real, readonly, profile, writeMode, applyPatches, dryRunPatches, maxWriteAgents, fastMode, serviceTier, noFast, ollamaEnabled: useOllama && !noOllama, noOllama, ollamaModel, ollamaBaseUrl, zellijSessionName, zellijPaneWorker, workerPlacement, zellijVisiblePaneCap, apply, dryRun, drain, staleMs, graceMs, killEscalation, json, missionId, lane, codexApp, patchEntryId }
}

export function resolveZellijVisiblePaneCap(value: unknown = '', explicit = false) {
  const requested = Number(value)
  if (explicit && Number.isFinite(requested) && requested >= 1) return Math.max(1, Math.floor(requested))
  const columns = Number(process.env.SKS_ZELLIJ_TERMINAL_COLUMNS || process.env.COLUMNS || process.stdout?.columns || 0)
  const unknownFallback = Number(process.env.SKS_ZELLIJ_UNKNOWN_VISIBLE_PANE_CAP || 3)
  if (!Number.isFinite(columns) || columns < 120) {
    return Math.max(1, Math.floor(Number.isFinite(unknownFallback) ? unknownFallback : 3))
  }
  const reservedColumns = Number(process.env.SKS_ZELLIJ_RESERVED_COLUMNS || 108)
  const minWorkerColumns = Number(process.env.SKS_ZELLIJ_MIN_WORKER_PANE_COLUMNS || 72)
  const maxAutoVisible = Number(process.env.SKS_ZELLIJ_MAX_AUTO_VISIBLE_PANES || 8)
  const available = Math.max(0, columns - Math.max(80, reservedColumns))
  const computed = Math.floor(available / Math.max(40, minWorkerColumns))
  return Math.max(1, Math.min(Math.max(1, Math.floor(maxAutoVisible || 8)), computed || Math.floor(unknownFallback) || 3))
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

function hasOption(args: string[], name: string) {
  return args.includes(name) || args.some((arg) => String(arg).startsWith(name + '='))
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

import os from 'node:os'
import { DEFAULT_AGENT_CONCURRENCY, DEFAULT_AGENT_COUNT, DEFAULT_NARUTO_CLONES, MAX_AGENT_COUNT, MAX_NARUTO_AGENT_COUNT, agentSessionId } from './agent-schema.js'
import type { AgentPersona, AgentRosterEntry } from './agent-schema.js'
import { defaultAgentPersonas, validatePersonaUniqueness } from './agent-persona.js'
import { buildAgentEffortPolicy, decideAgentEffort, decideNarutoCloneEffort } from './agent-effort-policy.js'

// $Naruto must never blindly spawn the full clone count at once. The clone roster is the
// total work fan-out, but live CONCURRENCY (scheduler active slots) is capped to what the
// host can safely sustain — derived from CPU cores and free memory, heavier-bounded for
// real child-process backends (codex-exec/zellij/process) than for in-process (fake).
export function systemSafeNarutoConcurrency(opts: { backend?: string } = {}) {
  const cores = Math.max(1, Number(os.cpus()?.length) || 4)
  let freeBytes = 2 * 1024 * 1024 * 1024
  try { freeBytes = os.freemem() || freeBytes } catch { /* keep fallback */ }
  const freeGb = freeBytes / (1024 * 1024 * 1024)
  const backend = String(opts.backend || 'codex-exec')
  const heavy = backend === 'codex-exec' || backend === 'zellij' || backend === 'process'
  let cap: number
  if (heavy) {
    // Real codex children are heavy (a model call + process). Leave a core free and budget
    // ~0.6 GB per concurrent worker; clamp to a sane ceiling.
    const byCpu = Math.max(1, cores - 1)
    const byMem = Math.max(1, Math.floor(freeGb / 0.6))
    cap = Math.min(byCpu, byMem, 16)
  } else {
    // In-process / light workers can pack tighter.
    cap = Math.min(Math.max(2, cores * 2), 32)
  }
  const override = Number(process.env.SKS_NARUTO_MAX_CONCURRENCY)
  if (Number.isFinite(override) && override >= 1) cap = Math.min(Math.floor(override), MAX_NARUTO_AGENT_COUNT)
  cap = Math.max(1, Math.min(cap, MAX_NARUTO_AGENT_COUNT))
  return { cap, cores, free_gb: Math.round(freeGb * 10) / 10, backend, heavy, override_applied: Number.isFinite(override) && override >= 1 }
}

function resolveMaxAgentCount(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 1) return MAX_AGENT_COUNT
  return Math.floor(parsed)
}

export function normalizeAgentCount(value: unknown, fallback = DEFAULT_AGENT_COUNT, maxAgentCount: number = MAX_AGENT_COUNT): number {
  const parsed = Number(value ?? fallback)
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  const count = Math.floor(parsed)
  if (count > maxAgentCount) throw new Error('Agent count ' + count + ' exceeds max ' + maxAgentCount)
  return count
}

export function normalizeAgentConcurrency(value: unknown, agents: number, maxAgentCount: number = MAX_AGENT_COUNT): number {
  const parsed = Number(value ?? Math.min(agents, DEFAULT_AGENT_CONCURRENCY))
  if (!Number.isFinite(parsed) || parsed < 1) return Math.min(agents, DEFAULT_AGENT_CONCURRENCY)
  if (parsed > maxAgentCount) throw new Error('Agent concurrency ' + parsed + ' exceeds max ' + maxAgentCount)
  return Math.min(Math.floor(parsed), agents)
}

export function buildAgentRoster(opts: { agents?: unknown; concurrency?: unknown; prompt?: string; readonly?: boolean; maxAgentCount?: number } = {}) {
  const maxAgentCount = resolveMaxAgentCount(opts.maxAgentCount)
  const agentCount = normalizeAgentCount(opts.agents, DEFAULT_AGENT_COUNT, maxAgentCount)
  const concurrency = normalizeAgentConcurrency(opts.concurrency, agentCount, maxAgentCount)
  const personas = defaultAgentPersonas(agentCount)
  const uniqueness = validatePersonaUniqueness(personas)
  if (!uniqueness.ok) throw new Error('Invalid agent personas: ' + JSON.stringify(uniqueness))
  const roster: AgentRosterEntry[] = personas.map((persona, index) => {
    const effort = decideAgentEffort({ persona, prompt: opts.prompt || '', agentId: persona.id, readonly: opts.readonly === true || persona.read_only })
    return {
      id: persona.id,
      session_id: agentSessionId(persona.id, index + 1),
      persona_id: persona.id,
      role: persona.role,
      index: index + 1,
      write_policy: persona.write_policy,
      status: 'pending',
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      reasoning_profile: effort.reasoning_profile,
      service_tier: effort.service_tier,
      reasoning_reason: effort.reason,
      dynamic_effort_policy: {
        escalation_triggers: effort.escalation_triggers,
        downshift_triggers: effort.downshift_triggers
      }
    }
  })
  const result = {
    schema: 'sks.agent-roster.v1',
    default_agents: DEFAULT_AGENT_COUNT,
    max_agents: maxAgentCount,
    agent_count: agentCount,
    concurrency,
    batch_count: Math.ceil(agentCount / concurrency),
    personas,
    persona_uniqueness: uniqueness,
    roster
  }
  return {
    ...result,
    effort_policy: buildAgentEffortPolicy(result)
  }
}

// $Naruto Shadow Clone Jutsu (影分身): build a roster of up to MAX_NARUTO_AGENT_COUNT
// identical clones. Naruto's clones are copies, not distinct personas, so we cycle the
// fixed persona pool and stamp each clone with a unique `clone-NNN` id/session — this
// scales past the 20 unique-persona ceiling while keeping full persona fields for
// downstream work partition and strategy. The returned shape matches what the
// orchestrator's buildProvidedAgentRoster() consumes (roster + personas + concurrency).
export function buildNarutoCloneRoster(opts: { clones?: unknown; prompt?: string; readonly?: boolean; maxAgentCount?: number } = {}) {
  const maxAgentCount = resolveMaxAgentCount(opts.maxAgentCount ?? MAX_NARUTO_AGENT_COUNT)
  // Clones clamp to the ceiling rather than throwing — a swarm should cap, not crash.
  const requested = Number(opts.clones)
  const cloneCount = !Number.isFinite(requested) || requested < 1
    ? Math.min(DEFAULT_NARUTO_CLONES, maxAgentCount)
    : Math.min(maxAgentCount, Math.floor(requested))
  const readonly = opts.readonly === true
  const pool = defaultAgentPersonas(maxAgentCount)
  const basePool = pool.length ? pool : defaultAgentPersonas(DEFAULT_AGENT_COUNT)
  const personas: AgentPersona[] = []
  const roster: AgentRosterEntry[] = []
  for (let index = 0; index < cloneCount; index += 1) {
    const base = basePool[index % basePool.length] as AgentPersona
    const cloneTag = 'clone-' + String(index + 1).padStart(3, '0')
    const id = 'naruto_' + cloneTag.replace(/-/g, '_')
    const cloneReadonly = readonly || base.read_only
    // Dynamic per-clone effort like team mode, capped at low/medium and always fast.
    const effort = decideNarutoCloneEffort({ persona: base, prompt: opts.prompt || '', agentId: id, readonly: cloneReadonly })
    const persona: AgentPersona = {
      ...base,
      id,
      stable_id: base.stable_id + '-' + cloneTag,
      read_only: readonly || base.read_only,
      prompt: 'SHADOW CLONE: ' + cloneTag + ' (Kage Bunshin of ' + base.stable_id + ')\n' + base.prompt
    }
    personas.push(persona)
    roster.push({
      id,
      session_id: agentSessionId(id, index + 1),
      persona_id: id,
      role: base.role,
      index: index + 1,
      write_policy: cloneReadonly ? 'read-only' : base.write_policy,
      status: 'pending',
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      reasoning_profile: effort.reasoning_profile,
      service_tier: 'fast',
      fast_mode: true,
      reasoning_reason: effort.reason,
      dynamic_effort_policy: {
        escalation_triggers: effort.escalation_triggers,
        downshift_triggers: effort.downshift_triggers
      }
    })
  }
  const concurrency = normalizeAgentConcurrency(cloneCount, cloneCount, maxAgentCount)
  const result = {
    schema: 'sks.agent-roster.v1',
    default_agents: DEFAULT_NARUTO_CLONES,
    max_agents: maxAgentCount,
    agent_count: cloneCount,
    concurrency,
    batch_count: 1,
    clone_count: cloneCount,
    service_tier: 'fast',
    fast_mode: true,
    personas,
    persona_uniqueness: { ok: true, duplicates: [], duplicate_stable_ids: [], recursive_personas: [], incomplete_personas: [] },
    roster
  }
  return { ...result, effort_policy: buildAgentEffortPolicy(result) }
}

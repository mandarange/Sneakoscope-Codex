import os from 'node:os'
import { DEFAULT_AGENT_CONCURRENCY, DEFAULT_AGENT_COUNT, DEFAULT_NARUTO_CLONES, MAX_AGENT_COUNT, MAX_NARUTO_AGENT_COUNT, agentSessionId } from './agent-schema.js'
import type { AgentPersona, AgentRosterEntry } from './agent-schema.js'
import { defaultAgentPersonas, validatePersonaUniqueness } from './agent-persona.js'
import { buildAgentEffortPolicy, decideAgentEffort, decideNarutoCloneEffort } from './agent-effort-policy.js'
import { mapNarutoRoleToAgentRole, narutoRoleAllowsWrite, type NarutoWorkerRole } from '../naruto/naruto-role-policy.js'

// The roster may contain many queued clones, but active Codex workers are real
// Node/Codex processes. Reserve interactive CPU and memory so the desktop stays
// responsive; environment overrides can lower this cap, never raise it.
export function systemSafeNarutoConcurrency(opts: { backend?: string; cores?: number; freeBytes?: number; totalBytes?: number; loadAverage?: number } = {}) {
  const cores = Math.max(1, Number(opts.cores ?? os.cpus()?.length) || 4)
  let freeBytes = 2 * 1024 * 1024 * 1024
  let totalBytes = 8 * 1024 * 1024 * 1024
  try { freeBytes = Number(opts.freeBytes ?? os.freemem()) || freeBytes } catch { /* keep fallback */ }
  try { totalBytes = Number(opts.totalBytes ?? os.totalmem()) || totalBytes } catch { /* keep fallback */ }
  const freeGb = freeBytes / (1024 * 1024 * 1024)
  const totalGb = totalBytes / (1024 * 1024 * 1024)
  const backend = String(opts.backend || 'codex-sdk')
  const heavy = backend === 'codex-sdk' || backend === 'zellij' || backend === 'process' || backend === 'ollama'
  const reserveGb = Math.max(2, totalGb * 0.2)
  const budgetGb = Math.max(0.5, freeGb - reserveGb)
  const gbPerWorker = positiveEnvNumber(heavy ? 'SKS_NARUTO_GB_PER_WORKER' : 'SKS_NARUTO_LIGHT_GB_PER_WORKER', heavy ? 1.5 : 0.5)
  const byMem = Math.max(1, Math.floor(budgetGb / gbPerWorker))
  const byCpu = Math.max(1, Math.min(4, Math.floor(cores * (heavy ? 0.4 : 0.5))))
  const load = Math.max(0, Number(opts.loadAverage ?? os.loadavg()[0]) || 0)
  const byLoad = load >= cores ? 1 : load >= cores * 0.75 ? Math.min(2, byCpu) : byCpu
  let cap = Math.min(byMem, byCpu, byLoad, 4)
  const override = Number(process.env.SKS_NARUTO_MAX_CONCURRENCY)
  if (Number.isFinite(override) && override >= 1) cap = Math.min(cap, Math.floor(override))
  cap = Math.max(1, Math.min(cap, 4))
  return {
    cap,
    cores,
    free_gb: Math.round(freeGb * 10) / 10,
    total_gb: Math.round(totalGb * 10) / 10,
    load_average: Math.round(load * 100) / 100,
    backend,
    heavy,
    override_applied: Number.isFinite(override) && override >= 1,
    memory_model: heavy ? 'reserved_interactive_memory_heavy_worker' : 'reserved_interactive_memory_light_worker'
  }
}

function positiveEnvNumber(name: string, fallback: number): number {
  const parsed = Number(process.env[name])
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
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
  const desktopSafeCap = Math.max(1, Math.min(agents, maxAgentCount, DEFAULT_AGENT_CONCURRENCY))
  const parsed = Number(value ?? desktopSafeCap)
  if (!Number.isFinite(parsed) || parsed < 1) return desktopSafeCap
  if (parsed > maxAgentCount) throw new Error('Agent concurrency ' + parsed + ' exceeds max ' + maxAgentCount)
  return Math.min(Math.floor(parsed), desktopSafeCap)
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
      model: effort.model,
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      model_tier: effort.model_tier,
      model_profile: effort.model_profile,
      model_selection_reason: effort.model_selection_reason,
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
  const roleCycle = narutoRoleCycle(readonly)
  for (let index = 0; index < cloneCount; index += 1) {
    const base = basePool[index % basePool.length] as AgentPersona
    const cloneTag = 'clone-' + String(index + 1).padStart(3, '0')
    const id = 'naruto_' + cloneTag.replace(/-/g, '_')
    const narutoRole = roleCycle[index % roleCycle.length] || 'verifier'
    const writeAllowed = !readonly && narutoRoleAllowsWrite(narutoRole)
    const cloneReadonly = readonly || !writeAllowed
    const role = mapNarutoRoleToAgentRole(narutoRole)
    const allowedTools = writeAllowed ? ['read', 'search', 'edit', 'test'] : narutoRole === 'verifier' ? ['read', 'search', 'test'] : ['read', 'search']
    // Dynamic Naruto-only GPT-5.6 model/effort policy; there is no legacy low/medium cap.
    const effort = decideNarutoCloneEffort({ persona: { ...base, role, naruto_role: narutoRole, allowed_tools: allowedTools, read_only: cloneReadonly, write_policy: writeAllowed ? 'exclusive Naruto patch-envelope lease required' : 'read-only Naruto role' }, prompt: opts.prompt || '', agentId: id, readonly: cloneReadonly })
    const persona: AgentPersona = {
      ...base,
      id,
      stable_id: base.stable_id + '-' + cloneTag,
      role,
      naruto_role: narutoRole,
      write_allowed: writeAllowed,
      read_only: cloneReadonly,
      allowed_tools: allowedTools,
      write_policy: writeAllowed ? 'exclusive Naruto patch-envelope lease required' : 'read-only Naruto role',
      prompt: 'SHADOW CLONE: ' + cloneTag + ' (Kage Bunshin of ' + base.stable_id + ')\nNARUTO ROLE: ' + narutoRole + '\n' + base.prompt
    }
    personas.push(persona)
    roster.push({
      id,
      session_id: agentSessionId(id, index + 1),
      persona_id: id,
      role,
      naruto_role: narutoRole,
      write_allowed: writeAllowed,
      index: index + 1,
      write_policy: cloneReadonly ? 'read-only' : 'exclusive Naruto patch-envelope lease required',
      status: 'pending',
      model: effort.model,
      reasoning_effort: effort.reasoning_effort,
      model_reasoning_effort: effort.model_reasoning_effort,
      model_tier: effort.model_tier,
      model_profile: effort.model_profile,
      model_selection_reason: effort.model_selection_reason,
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

function narutoRoleCycle(readonly: boolean): NarutoWorkerRole[] {
  if (readonly) return ['verifier', 'researcher', 'verifier', 'gpt_final_arbiter']
  return [
    'implementer',
    'modifier',
    'test_writer',
    'verifier',
    'researcher',
    'conflict_resolver',
    'rollback_planner',
    'integrator',
    'modifier',
    'test_writer'
  ]
}

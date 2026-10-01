import path from 'node:path'
import { readJson, writeJsonAtomic } from '../fsx.js'
import { withFileLock } from '../locks/file-lock.js'
import { ensureConfinedDirectory } from '../managed-path-safety.js'
import {
  EXCLUSIVE_SURFACE_LABEL,
  exclusiveSurfaceOfRole,
  type ExclusiveToolSurface
} from '../subagents/exclusive-tool-surface.js'
import { officialSubagentArtifactDir } from './official-subagent-lifecycle.js'
import { isSpawnAgentToolName, spawnPayloadToolName } from './spawn-tool-name.js'

/**
 * Exclusive GUI surface gate.
 *
 * Computer Use and the browser are one shared screen or session each, so at
 * most one child may operate a surface at a time (see exclusive-tool-surface.ts).
 * The PreToolUse spawn check and the claim are one step under a file lock:
 * parallel spawn calls of one assistant turn all run PreToolUse before any
 * SubagentStart exists, so "running" cannot be derived from Start events. A
 * claim is `pending` from the allowed spawn, `running` once SubagentStart names
 * its agent id, and released by that agent's SubagentStop.
 *
 * The ledger lives in the session directory, not the mission directory, so it
 * is the same file at PreToolUse, Start, and Stop and also guards a parent that
 * is not in a Naruto mission. Two bounds keep a missed event from locking a
 * surface forever: a spawn that Codex rejects after PreToolUse never starts
 * (pending claim expires within seconds), and a child that never emits
 * SubagentStop expires after a stretch without any tool call of its own (each
 * child tool call refreshes its claim). SubagentStop ends a child TURN, not the
 * child: a resumed operator gets a Stop per turn and no new Start, so its next
 * tool call adopts the surface again when nobody else holds it. The gate
 * recognises only the managed operator roles by the `agent_type` the spawn
 * really carries: OpenRouter Only routes a managed role to a list role before
 * the claim, so such a spawn is covered by the prompt rule alone.
 */

const EXCLUSIVE_GUI_SURFACE_LEDGER_SCHEMA = 'sks.exclusive-gui-surface-ledger.v1'
export const EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME = 'exclusive-gui-surfaces.json'
export const PENDING_CLAIM_TTL_MS = 30_000
export const RUNNING_CLAIM_TTL_MS = 20 * 60_000
const CLAIM_REFRESH_INTERVAL_MS = 30_000

interface SurfaceClaim {
  surface: ExclusiveToolSurface
  state: 'pending' | 'running'
  agent_type: string
  agent_id: string | null
  /** The spawn call that made a pending claim, so a re-delivered PreToolUse is not denied by its own claim. */
  tool_use_id?: string | null
  claimed_at: string
  last_seen_at: string
}

type ExclusiveGuiSurfaceDecision = { action: 'allow' } | { action: 'block'; message: string }

interface GateInput {
  root: string
  sessionKey: unknown
  payload: any
  /** Epoch milliseconds; tests inject it. */
  now?: number
}

const ALLOW: ExclusiveGuiSurfaceDecision = { action: 'allow' }

function text(value: unknown): string {
  return String(value ?? '').trim()
}

function spawnToolInput(payload: any): Record<string, unknown> {
  const input = payload?.tool_input || payload?.toolInput || payload?.tool?.input || payload?.input
  return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
}

function ledgerPaths(root: string, sessionKey: unknown) {
  const dir = officialSubagentArtifactDir(root, {}, sessionKey)
  return {
    dir,
    file: path.join(dir, EXCLUSIVE_GUI_SURFACE_LEDGER_FILENAME),
    lock: path.join(dir, '.exclusive-gui-surface.lock')
  }
}

function validClaim(raw: any): raw is SurfaceClaim {
  return Boolean(raw)
    && (raw.surface === 'computer_use' || raw.surface === 'browser')
    && (raw.state === 'pending' || raw.state === 'running')
    && (raw.agent_id === null || typeof raw.agent_id === 'string')
    && Number.isFinite(Date.parse(raw.claimed_at))
    && Number.isFinite(Date.parse(raw.last_seen_at))
}

async function readClaims(file: string): Promise<SurfaceClaim[]> {
  const raw: any = await readJson(file, null).catch(() => null)
  return Array.isArray(raw?.claims) ? raw.claims.filter(validClaim) : []
}

function isLive(claim: SurfaceClaim, at: number): boolean {
  return claim.state === 'pending'
    ? at - Date.parse(claim.claimed_at) <= PENDING_CLAIM_TTL_MS
    : at - Date.parse(claim.last_seen_at) <= RUNNING_CLAIM_TTL_MS
}

/** Read, drop expired claims, let `change` edit the rest, and write back only when something changed; all under one lock. */
async function withClaims<T>(
  input: GateInput,
  change: (claims: SurfaceClaim[], at: number) => { claims: SurfaceClaim[]; result: T }
): Promise<T> {
  const paths = ledgerPaths(input.root, input.sessionKey)
  await ensureConfinedDirectory(path.resolve(input.root), paths.dir)
  return withFileLock({ lockPath: paths.lock, timeoutMs: 5_000, staleMs: 60_000 }, async () => {
    const at = input.now ?? Date.now()
    const before = await readClaims(paths.file)
    // `change` edits claims in place, so the unchanged ledger is serialized first.
    const beforeJson = JSON.stringify(before)
    const outcome = change(before.filter((claim) => isLive(claim, at)), at)
    if (JSON.stringify(outcome.claims) !== beforeJson) {
      await writeJsonAtomic(paths.file, { schema: EXCLUSIVE_GUI_SURFACE_LEDGER_SCHEMA, claims: outcome.claims })
    }
    return outcome.result
  })
}

function denyMessage(surface: ExclusiveToolSurface, agentType: string, owner: SurfaceClaim, at: number): string {
  const label = EXCLUSIVE_SURFACE_LABEL[surface]
  const seconds = Math.max(0, Math.round((at - Date.parse(owner.claimed_at)) / 1000))
  const who = owner.agent_id
    ? `child ${owner.agent_id}, which has not stopped (it frees itself ${RUNNING_CLAIM_TTL_MS / 60_000} minutes after its last tool call)`
    : `a spawn allowed ${seconds} s ago that has not started yet (if Codex rejected that spawn, the surface frees itself ${PENDING_CLAIM_TTL_MS / 1000} s after it)`
  return `SKS exclusive GUI surface gate denied spawn_agent (agent_type "${agentType}"): the ${label} surface is already owned by ${who}. ${label} drives one shared screen or session with one pointer and keyboard focus, so only one child may operate it at a time and a second operator would only repeat the same task. Wait for that child to finish and use its returned evidence, or fold this task into that single operator slice; spawn another ${label} child only after it stops. Do not give the same task to another child and do not do it in the parent while that child runs.`
}

/**
 * PreToolUse of a spawn_agent call: deny a second child for a surface that
 * already has an unstopped owner, otherwise claim the surface for this spawn.
 * Calls naming no operator role cost nothing. A ledger that cannot be read or
 * locked lets the spawn through, like the neighbouring spawn guards.
 */
export async function claimExclusiveGuiSurface(input: GateInput): Promise<ExclusiveGuiSurfaceDecision> {
  if (!isSpawnAgentToolName(spawnPayloadToolName(input.payload))) return ALLOW
  const spawn = spawnToolInput(input.payload)
  const agentType = text(spawn.agent_type ?? spawn.agentType)
  const surface = exclusiveSurfaceOfRole(agentType)
  if (!surface) return ALLOW
  const toolUseId = text(input.payload?.tool_use_id ?? input.payload?.toolUseId) || null
  try {
    return await withClaims<ExclusiveGuiSurfaceDecision>(input, (claims, at) => {
      const owner = claims.find((claim) => claim.surface === surface)
      // PreToolUse can be delivered twice (a daemon timeout falls back to an inline run); the call that made the claim is not a second owner.
      if (owner?.state === 'pending' && toolUseId && owner.tool_use_id === toolUseId) return { claims, result: ALLOW }
      if (owner) return { claims, result: { action: 'block', message: denyMessage(surface, agentType, owner, at) } }
      const iso = new Date(at).toISOString()
      const pending: SurfaceClaim = { surface, state: 'pending', agent_type: agentType, agent_id: null, tool_use_id: toolUseId, claimed_at: iso, last_seen_at: iso }
      return { claims: [...claims, pending], result: ALLOW }
    })
  } catch {
    return ALLOW
  }
}

/** SubagentStart of an operator child: bind the oldest pending claim of its surface to its agent id (or record the owner the host never claimed). */
export async function bindExclusiveGuiSurfaceStart(input: GateInput): Promise<void> {
  const agentId = text(input.payload?.agent_id ?? input.payload?.agentId)
  const agentType = text(input.payload?.agent_type ?? input.payload?.agentType)
  const surface = exclusiveSurfaceOfRole(agentType)
  if (!agentId || !surface) return
  await withClaims<void>(input, (claims, at) => {
    const iso = new Date(at).toISOString()
    // Codex can reuse an agent id for a later generation without a Stop.
    const rest = claims.filter((claim) => claim.agent_id !== agentId || claim.surface === surface)
    const target = rest.find((claim) => claim.agent_id === agentId)
      ?? rest
        .filter((claim) => claim.state === 'pending' && claim.surface === surface)
        .sort((left, right) => Date.parse(left.claimed_at) - Date.parse(right.claimed_at))[0]
    if (target) {
      target.state = 'running'
      target.agent_id = agentId
      target.last_seen_at = iso
      return { claims: rest, result: undefined }
    }
    rest.push({ surface, state: 'running', agent_type: agentType, agent_id: agentId, claimed_at: iso, last_seen_at: iso })
    return { claims: rest, result: undefined }
  })
}

/** SubagentStop: the child's surface is free again. */
export async function releaseExclusiveGuiSurface(input: GateInput): Promise<void> {
  const agentId = text(input.payload?.agent_id ?? input.payload?.agentId)
  if (!agentId) return
  const { file } = ledgerPaths(input.root, input.sessionKey)
  if (!(await readClaims(file)).some((claim) => claim.agent_id === agentId)) return
  await withClaims<void>(input, (claims) => ({
    claims: claims.filter((claim) => claim.agent_id !== agentId),
    result: undefined
  }))
}

/**
 * A tool call of an operator child keeps its claim alive, at most one write per
 * refresh interval. A child that holds no claim (its Stop ended an earlier
 * turn and Codex resumed it without a new Start, or its claim expired) adopts
 * its surface again when no other live claim holds it.
 */
export async function refreshExclusiveGuiSurfaceOwner(input: GateInput): Promise<void> {
  const agentId = text(input.payload?.agent_id ?? input.payload?.agentId)
  if (!agentId) return
  const agentType = text(input.payload?.agent_type ?? input.payload?.agentType)
  const surface = exclusiveSurfaceOfRole(agentType)
  const { file } = ledgerPaths(input.root, input.sessionKey)
  const at = input.now ?? Date.now()
  const claims = await readClaims(file)
  const mine = claims.find((claim) => claim.agent_id === agentId)
  if (mine) {
    if (at - Date.parse(mine.last_seen_at) < CLAIM_REFRESH_INTERVAL_MS) return
  } else if (!surface || claims.some((claim) => claim.surface === surface && isLive(claim, at))) {
    return
  }
  await withClaims<void>(input, (live, now) => {
    const iso = new Date(now).toISOString()
    const claim = live.find((row) => row.agent_id === agentId)
    if (claim) claim.last_seen_at = iso
    else if (surface && !live.some((row) => row.surface === surface)) {
      live.push({ surface, state: 'running', agent_type: agentType, agent_id: agentId, claimed_at: iso, last_seen_at: iso })
    }
    return { claims: live, result: undefined }
  })
}

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { AGENT_LEDGER_EVENT_SCHEMA, AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.js'
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.js'
import { redactSecrets } from '../secret-redaction.js'

const LEDGER_LOCKS = new Map<string, Promise<unknown>>()

export const AGENT_ORCHESTRATOR_ONLY_FILES = Object.freeze([
  'agent-roster.json',
  'agent-personas.json',
  'agent-task-board.json',
  'agent-task-board.md',
  'agent-leases.json',
  'agent-conflict-graph.json',
  'agent-consensus.json',
  'agent-proof-evidence.json',
  'agent-cleanup.json',
  'agent-session-cleanup.json',
  'agent-trust-report.json',
  'agent-trust-report.md',
  'agent-wrongness-records.json',
  'agent-lifecycle-policy.json',
  'agent-lifecycle-aggregate.json',
  'agent-lifecycle.json',
  'agent-central-ledger.json',
  'agent-ledger-compaction.json',
  'agent-central-ledger-compaction.json',
  'agent-no-overlap-proof.json',
  'agent-backend-report.json',
  'agent-output-validation.json',
  'agent-output-tails.json',
  'agent-effort-policy.json',
  'agent-route-collaboration-plan.json'
])

async function withLedgerLock<T>(root: string, fn: () => Promise<T>): Promise<T> {
  const previous = LEDGER_LOCKS.get(root) || Promise.resolve()
  const next = previous.catch(() => undefined).then(fn)
  LEDGER_LOCKS.set(root, next.catch(() => undefined))
  return next
}

export function agentLedgerRoot(missionDir: string) {
  return path.join(missionDir, 'agents')
}

export function validateAgentLedgerWriteScope(input: { actor_agent_id: string; target_path: string; mode?: 'append' | 'write' }) {
  const actor = String(input.actor_agent_id || '')
  const target = normalizeLedgerPath(input.target_path)
  const mode = input.mode || 'write'
  const orchestrator = actor === 'orchestrator' || actor === 'parent_orchestrator'
  const sessionMatch = target.match(/^sessions\/([^/]+)\.json$/)
  const generationSessionMatch = target.match(/^sessions\/([^/]+)\/gen-\d+\/agent-session-record\.json$/)
  const messageAppend = target === 'agent-messages.jsonl' && mode === 'append'
  const eventAppend = target === 'agent-events.jsonl' && mode === 'append'
  const handoffAppend = target === 'agent-handoffs.jsonl' && mode === 'append'
  const ownSessionWrite = Boolean((sessionMatch && sessionMatch[1] === actor) || (generationSessionMatch && generationSessionMatch[1] === actor))
  const orchestratorOnly = AGENT_ORCHESTRATOR_ONLY_FILES.includes(target as any) || target === 'agent-sessions.json'

  if (orchestrator) return { ok: true, reason: 'orchestrator_write_allowed', actor_agent_id: actor, target_path: target, mode }
  if (ownSessionWrite) return { ok: true, reason: 'own_session_record_allowed', actor_agent_id: actor, target_path: target, mode }
  if (messageAppend || eventAppend || handoffAppend) return { ok: true, reason: 'central_append_allowed', actor_agent_id: actor, target_path: target, mode }
  if ((sessionMatch && sessionMatch[1] !== actor) || (generationSessionMatch && generationSessionMatch[1] !== actor)) return { ok: false, reason: 'agent_cannot_modify_other_session_record', actor_agent_id: actor, target_path: target, mode }
  if (orchestratorOnly) return { ok: false, reason: 'agent_cannot_modify_orchestrator_only_file', actor_agent_id: actor, target_path: target, mode }
  return { ok: false, reason: 'agent_ledger_write_scope_unclaimed', actor_agent_id: actor, target_path: target, mode }
}

export async function initializeAgentCentralLedger(missionDir: string, input: { missionId: string; roster: any; partition?: any; route?: string; prompt?: string; dynamicScheduler?: boolean }) {
  const root = agentLedgerRoot(missionDir)
  await ensureDir(root)
  await ensureDir(path.join(root, 'sessions'))
  await writeTextAtomic(path.join(root, 'agent-events.jsonl'), '')
  await writeTextAtomic(path.join(root, 'agent-messages.jsonl'), '')
  await writeTextAtomic(path.join(root, 'agent-handoffs.jsonl'), '')
  const sessions = input.dynamicScheduler ? {} : Object.fromEntries((input.roster.roster || []).map((agent: any) => [agent.id, {
    agent_id: agent.id,
    session_id: agent.session_id,
    status: 'pending',
    opened_at: null,
    closed_at: null,
    heartbeat_at: null
  }]))
  await writeJsonAtomic(path.join(root, 'agent-sessions.json'), { schema: 'sks.agent-sessions.v1', mission_id: input.missionId, sessions })
  await writeJsonAtomic(path.join(root, 'agent-roster.json'), input.roster)
  await writeJsonAtomic(path.join(root, 'agent-personas.json'), { schema: 'sks.agent-personas.v1', personas: input.roster.personas || [] })
  await writeJsonAtomic(path.join(root, 'agent-effort-policy.json'), input.roster.effort_policy || { schema: 'sks.agent-effort-policy.v1', dynamic: true, decisions: [] })
  await writeJsonAtomic(path.join(root, 'agent-task-board.json'), { schema: 'sks.agent-task-board.v1', mission_id: input.missionId, route: input.route || null, prompt: input.prompt || '', slices: input.partition?.slices || [] })
  await writeTextAtomic(path.join(root, 'agent-task-board.md'), renderTaskBoard(input.missionId, input.partition?.slices || []))
  await writeJsonAtomic(path.join(root, 'agent-leases.json'), { schema: 'sks.agent-leases.v1', leases: input.partition?.leases || [] })
  await writeJsonAtomic(path.join(root, 'agent-conflict-graph.json'), input.partition?.conflict_report?.graph || { schema: 'sks.agent-conflict-graph.v1', ok: true, nodes: [], conflicts: [], blockers: [] })
  await writeJsonAtomic(path.join(root, 'agent-consensus.json'), { schema: 'sks.agent-consensus.v1', ok: false, status: 'pending', agreements: [] })
  await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), { schema: AGENT_PROOF_EVIDENCE_SCHEMA, ok: false, status: 'pending', mission_id: input.missionId, blockers: ['agent_sessions_not_closed'] })
  await appendAgentLedgerEvent(root, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'ledger_initialized', payload: { mission_id: input.missionId } })
  return root
}

export async function appendAgentLedgerEvent(root: string, event: { agent_id: string; session_id: string; event_type: string; payload?: any }) {
  return withLedgerLock(root, async () => {
  const file = path.join(root, 'agent-events.jsonl')
  const previous = await readLedgerTail(file)
  const sequence = previous ? previous.sequence + 1 : 1
  const previous_hash = previous?.current_hash || null
  const entryWithoutHash = {
    schema: AGENT_LEDGER_EVENT_SCHEMA,
    sequence,
    timestamp: nowIso(),
    agent_id: event.agent_id,
    session_id: event.session_id,
    event_type: event.event_type,
    previous_hash,
    payload: redactSecrets(event.payload || {})
  }
  const current_hash = hashEntry(entryWithoutHash)
  const entry = { ...entryWithoutHash, current_hash }
  await fs.appendFile(file, JSON.stringify(entry) + '\n', 'utf8')
  return entry
  })
}

export async function validateAgentLedgerHashChain(root: string) {
  const file = path.join(root, 'agent-events.jsonl')
  const lines = (await fs.readFile(file, 'utf8').catch(() => '')).split(/\n/).filter(Boolean)
  const blockers: string[] = []
  let previousHash: string | null = null
  let expectedSequence = 1
  for (const line of lines) {
    const entry = JSON.parse(line)
    const { current_hash, ...withoutHash } = entry
    if (entry.sequence !== expectedSequence) blockers.push('sequence_mismatch:' + entry.sequence + ':' + expectedSequence)
    if ((entry.previous_hash || null) !== previousHash) blockers.push('previous_hash_mismatch:' + entry.sequence)
    if (hashEntry(withoutHash) !== current_hash) blockers.push('current_hash_mismatch:' + entry.sequence)
    previousHash = current_hash
    expectedSequence += 1
  }
  return { ok: blockers.length === 0, entries: lines.length, blockers }
}

export async function compactAgentLedger(root: string) {
  const validation = await validateAgentLedgerHashChain(root)
  const report = { schema: 'sks.agent-ledger-compaction.v1', compacted_at: nowIso(), validation }
  await writeJsonAtomic(path.join(root, 'agent-central-ledger.json'), { schema: 'sks.agent-central-ledger.v1', compacted_at: report.compacted_at, validation, event_log: 'agent-events.jsonl' })
  await writeJsonAtomic(path.join(root, 'agent-ledger-compaction.json'), report)
  await writeJsonAtomic(path.join(root, 'agent-central-ledger-compaction.json'), report)
  return validation
}

function renderTaskBoard(missionId: string, slices: any[]) {
  return ['# Native Agent Task Board', '', 'Mission: ' + missionId, '', ...slices.map((slice) => '- ' + slice.id + ': ' + slice.owner_agent_id + ' -> ' + slice.domain + ' (' + (slice.write_paths?.length || 0) + ' write leases)')].join('\n') + '\n'
}

async function readLedgerTail(file: string) {
  const text = await fs.readFile(file, 'utf8').catch(() => '')
  const line = text.trim().split(/\n/).filter(Boolean).at(-1)
  return line ? JSON.parse(line) : null
}

function hashEntry(entry: any) {
  return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex')
}

function normalizeLedgerPath(file: string) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/^agents\//, '')
}

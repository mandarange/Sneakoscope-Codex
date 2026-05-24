import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AGENT_LEDGER_EVENT_SCHEMA, AGENT_PROOF_EVIDENCE_SCHEMA } from './agent-schema.mjs';
import { ensureDir, nowIso, writeJsonAtomic, writeTextAtomic } from '../fsx.mjs';
import { redactSecrets } from '../secret-redaction.mjs';

const LEDGER_LOCKS = new Map();

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
  'agent-trust-report.json',
  'agent-trust-report.md',
  'agent-wrongness-records.json',
  'agent-lifecycle-policy.json',
  'agent-lifecycle-aggregate.json',
  'agent-lifecycle.json',
  'agent-ledger-compaction.json',
  'agent-central-ledger-compaction.json',
  'agent-no-overlap-proof.json',
  'agent-backend-report.json',
  'agent-output-validation.json',
  'agent-output-tails.json'
]);

async function withLedgerLock(root, fn) {
  const previous = LEDGER_LOCKS.get(root) || Promise.resolve();
  const next = previous.catch(() => undefined).then(fn);
  LEDGER_LOCKS.set(root, next.catch(() => undefined));
  return next;
}

export function agentLedgerRoot(missionDir) {
  return path.join(missionDir, 'agents');
}

export function validateAgentLedgerWriteScope(input) {
  const actor = String(input.actor_agent_id || '');
  const target = normalizeLedgerPath(input.target_path);
  const mode = input.mode || 'write';
  const orchestrator = actor === 'orchestrator' || actor === 'parent_orchestrator';
  const sessionMatch = target.match(/^sessions\/([^/]+)\.json$/);
  const messageAppend = target === 'agent-messages.jsonl' && mode === 'append';
  const eventAppend = target === 'agent-events.jsonl' && mode === 'append';
  const handoffAppend = target === 'agent-handoffs.jsonl' && mode === 'append';
  const ownSessionWrite = Boolean(sessionMatch && sessionMatch[1] === actor);
  const orchestratorOnly = AGENT_ORCHESTRATOR_ONLY_FILES.includes(target) || target === 'agent-sessions.json';

  if (orchestrator) return { ok: true, reason: 'orchestrator_write_allowed', actor_agent_id: actor, target_path: target, mode };
  if (ownSessionWrite) return { ok: true, reason: 'own_session_record_allowed', actor_agent_id: actor, target_path: target, mode };
  if (messageAppend || eventAppend || handoffAppend) return { ok: true, reason: 'central_append_allowed', actor_agent_id: actor, target_path: target, mode };
  if (sessionMatch && sessionMatch[1] !== actor) return { ok: false, reason: 'agent_cannot_modify_other_session_record', actor_agent_id: actor, target_path: target, mode };
  if (orchestratorOnly) return { ok: false, reason: 'agent_cannot_modify_orchestrator_only_file', actor_agent_id: actor, target_path: target, mode };
  return { ok: false, reason: 'agent_ledger_write_scope_unclaimed', actor_agent_id: actor, target_path: target, mode };
}

export async function initializeAgentCentralLedger(missionDir, input) {
  const root = agentLedgerRoot(missionDir);
  await ensureDir(root);
  await ensureDir(path.join(root, 'sessions'));
  await writeTextAtomic(path.join(root, 'agent-events.jsonl'), '');
  await writeTextAtomic(path.join(root, 'agent-messages.jsonl'), '');
  await writeTextAtomic(path.join(root, 'agent-handoffs.jsonl'), '');
  const sessions = Object.fromEntries((input.roster.roster || []).map((agent) => [agent.id, {
    agent_id: agent.id,
    session_id: agent.session_id,
    status: 'pending',
    opened_at: null,
    closed_at: null,
    heartbeat_at: null
  }]));
  await writeJsonAtomic(path.join(root, 'agent-sessions.json'), { schema: 'sks.agent-sessions.v1', mission_id: input.missionId, sessions });
  await writeJsonAtomic(path.join(root, 'agent-roster.json'), input.roster);
  await writeJsonAtomic(path.join(root, 'agent-personas.json'), { schema: 'sks.agent-personas.v1', personas: input.roster.personas || [] });
  await writeJsonAtomic(path.join(root, 'agent-task-board.json'), { schema: 'sks.agent-task-board.v1', mission_id: input.missionId, route: input.route || null, prompt: input.prompt || '', slices: input.partition?.slices || [] });
  await writeTextAtomic(path.join(root, 'agent-task-board.md'), renderTaskBoard(input.missionId, input.partition?.slices || []));
  await writeJsonAtomic(path.join(root, 'agent-leases.json'), { schema: 'sks.agent-leases.v1', leases: input.partition?.leases || [] });
  await writeJsonAtomic(path.join(root, 'agent-conflict-graph.json'), input.partition?.conflict_report?.graph || { schema: 'sks.agent-conflict-graph.v1', ok: true, nodes: [], conflicts: [], blockers: [] });
  await writeJsonAtomic(path.join(root, 'agent-consensus.json'), { schema: 'sks.agent-consensus.v1', ok: false, status: 'pending', agreements: [] });
  await writeJsonAtomic(path.join(root, 'agent-proof-evidence.json'), { schema: AGENT_PROOF_EVIDENCE_SCHEMA, ok: false, status: 'pending', mission_id: input.missionId, blockers: ['agent_sessions_not_closed'] });
  await appendAgentLedgerEvent(root, { agent_id: 'orchestrator', session_id: 'orchestrator', event_type: 'ledger_initialized', payload: { mission_id: input.missionId } });
  return root;
}

export async function appendAgentLedgerEvent(root, event) {
  return withLedgerLock(root, async () => {
    const file = path.join(root, 'agent-events.jsonl');
    const previous = await readLedgerTail(file);
    const sequence = previous ? previous.sequence + 1 : 1;
    const previous_hash = previous?.current_hash || null;
    const entryWithoutHash = {
      schema: AGENT_LEDGER_EVENT_SCHEMA,
      sequence,
      timestamp: nowIso(),
      agent_id: event.agent_id,
      session_id: event.session_id,
      event_type: event.event_type,
      previous_hash,
      payload: redactSecrets(event.payload || {})
    };
    const current_hash = hashEntry(entryWithoutHash);
    const entry = { ...entryWithoutHash, current_hash };
    await fs.appendFile(file, `${JSON.stringify(entry)}\n`, 'utf8');
    return entry;
  });
}

function renderTaskBoard(missionId, slices) {
  return ['# Native Agent Task Board', '', `Mission: ${missionId}`, '', ...slices.map((slice) => `- ${slice.id}: ${slice.owner_agent_id} -> ${slice.domain} (${slice.write_paths?.length || 0} write leases)`)].join('\n') + '\n';
}

async function readLedgerTail(file) {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  const line = text.trim().split(/\n/).filter(Boolean).at(-1);
  return line ? JSON.parse(line) : null;
}

function hashEntry(entry) {
  return crypto.createHash('sha256').update(JSON.stringify(entry)).digest('hex');
}

function normalizeLedgerPath(file) {
  return String(file || '').replace(/\\/g, '/').replace(/^\.?\/+/, '').replace(/^agents\//, '');
}

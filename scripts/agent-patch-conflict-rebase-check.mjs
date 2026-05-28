#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';
import { writeReport } from './agent-patch-swarm-gate-lib.mjs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sks-conflict-rebase-'));
fs.writeFileSync(path.join(dir, 'same.txt'), 'base\n');
const queueMod = await importDist('core/agents/agent-patch-queue-store.js');
const mergeMod = await importDist('core/agents/agent-merge-coordinator.js');
const rebaseMod = await importDist('core/agents/agent-patch-conflict-rebase.js');
const proofMod = await importDist('core/agents/agent-patch-proof.js');
const journalMod = await importDist('core/agents/agent-patch-transaction-journal.js');
const store = new queueMod.PersistentAgentPatchQueueStore(dir);
const makeEnvelope = (agent, content, allowedPaths = ['same.txt'], writePath = 'same.txt') => ({
  schema: 'sks.agent-patch-envelope.v1',
  agent_id: agent,
  session_id: `session-${agent}`,
  slot_id: `slot-${agent}`,
  generation_index: 1,
  lease_id: `lease-${agent}`,
  lease_proof: {
    lease_id: `lease-${agent}`,
    owner_agent: agent,
    owner_persona: 'fixture',
    allowed_paths: allowedPaths,
    strategy_task_id: `task-${agent}`,
    micro_win_id: `win-${agent}`,
    verification_node_id: `verify-${agent}`,
    rollback_node_id: `rollback-${agent}`,
    protected_path_check: 'passed'
  },
  verification_hint: { node_id: `verify-${agent}` },
  rollback_hint: { node_id: `rollback-${agent}` },
  operations: [{ op: 'write', path: writePath, content }]
});
const a = await store.enqueue(makeEnvelope('agent-a', 'agent-a\n'), { mission_id: 'M-conflict', route: '$Agent' });
const b = await store.enqueue(makeEnvelope('agent-b', 'agent-b\n'), { mission_id: 'M-conflict', route: '$Agent' });
const merge = mergeMod.coordinateAgentPatchMerge([a, b]);
const rebase = await rebaseMod.executeAgentPatchConflictRebase(dir, [a, b], merge, { artifactsDir: dir });
const journal = new journalMod.AgentPatchTransactionJournal(dir);
for (const id of rebase.succeeded_entry_ids) {
  const applyResult = rebase.apply_results.find((row) => row.entry_id === id);
  await store.markApplying(id);
  await store.markApplied(id);
  await journal.append({ event_type: 'verification_started', entry_id: id, agent_id: applyResult?.agent_id || null, lease_id: applyResult?.lease_id || null, status: 'started', changed_files: applyResult?.changed_files || [], rollback_digest: applyResult?.rollback_digest || null });
  await journal.append({ event_type: 'verification_finished', entry_id: id, agent_id: applyResult?.agent_id || null, lease_id: applyResult?.lease_id || null, status: 'verified', verification_status: applyResult?.verification?.status || 'verified', changed_files: applyResult?.changed_files || [], rollback_digest: applyResult?.rollback_digest || null });
  await store.markVerified(id);
}
const journalSummary = await journal.writeSummary();
const proof = proofMod.buildAgentPatchProof({
  queue: store.queue.toJSON(),
  merge: { ...merge, ok: true, blockers: [], unresolved_conflict_entry_ids: [] },
  applyResults: rebase.apply_results,
  verification: ['verified'],
  parallelWritePolicy: { write_mode: 'serial' },
  transactionJournal: journalSummary,
  conflictRebase: rebase
});
const unleased = await store.enqueue(makeEnvelope('agent-unleased', 'bad\n', ['allowed.txt'], 'outside.txt'), { mission_id: 'M-conflict', route: '$Agent' });
const unleasedMerge = mergeMod.coordinateAgentPatchMerge([unleased]);
const unleasedRebase = await rebaseMod.executeAgentPatchConflictRebase(dir, [unleased], unleasedMerge, { artifactsDir: dir });
const report = { schema: 'sks.agent-patch-conflict-rebase-check.v1', ok: rebase.ok && proof.ok && unleasedRebase.ok === false, merge, rebase, proof, unleasedRebase };
writeReport('agent-patch-conflict-rebase', report);

assertGate(merge.serial_merge_groups.length === 1, 'same-file conflict must produce serial merge group', report);
assertGate(rebase.rebase_attempt_count === 2, 'serial rebase must attempt both conflicting patches', report);
assertGate(rebase.succeeded_entry_ids.length === 2, 'safe same-file serial retry must succeed', report);
assertGate(proof.conflict_rebase_ok === true && proof.ok === true, 'patch proof must accept successful conflict rebase result', report);
assertGate(unleasedRebase.ok === false, 'unleased path conflict must remain blocked', report);
emitGate('agent:patch-conflict-rebase', { rebase_attempt_count: rebase.rebase_attempt_count });

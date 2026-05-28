#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.mjs';
import { makeTempPatchProject, writeReport } from './agent-patch-swarm-gate-lib.mjs';

const queueMod = await importDist('core/agents/agent-patch-queue.js');
const mergeMod = await importDist('core/agents/agent-merge-coordinator.js');
const applyMod = await importDist('core/agents/agent-patch-apply-worker.js');
const proofMod = await importDist('core/agents/agent-patch-proof.js');
const tmp = makeTempPatchProject('sks-patch-proof-');
const queue = new queueMod.InMemoryAgentPatchQueue();
for (let index = 1; index <= 5; index += 1) {
  queue.enqueue({
    schema: 'sks.agent-patch-envelope.v1',
    agent_id: `agent-${index}`,
    session_id: `session-${index}`,
	    slot_id: `slot-${index}`,
	    generation_index: 1,
	    lease_id: `lease-${index}`,
	    lease_proof: { lease_id: `lease-${index}`, allowed_paths: [`file-${index}.txt`], strategy_task_id: `task-${index}`, owner_agent: `agent-${index}`, verification_node_id: `verify-${index}`, rollback_node_id: `rollback-${index}` },
	    rollback_hint: { node_id: `rollback-${index}` },
	    operations: [{ op: 'write', path: `file-${index}.txt`, content: `after-${index}\n` }]
	  });
}
const merge = mergeMod.coordinateAgentPatchMerge(queue.queued());
const applyResults = [];
for (const entry of queue.queued()) {
  const applied = await applyMod.applyAgentPatchEnvelope(tmp, entry.envelope, { entryId: entry.id });
  applyResults.push(applied);
  if (applied.ok) queue.markApplied(entry.id);
}
for (const entry of queue.entries) queue.markVerified(entry.id);
	const verificationRollbackDag = {
	  nodes: queue.entries.flatMap((entry, index) => [
	    { id: `verify-${index + 1}`, kind: 'verification' },
	    { id: `rollback-${index + 1}`, kind: 'rollback' }
	  ])
	};
	const fileOwnershipPlan = {
	  owners: queue.entries.flatMap((entry, index) => (entry.write_paths || []).map((file) => ({ path: file, access: 'write', owner_agent: `agent-${index + 1}` })))
	};
	const proof = proofMod.buildAgentPatchProof({
	  queue: queue.toJSON(),
	  merge,
	  applyResults,
	  verification: applyResults.map((row) => row.verification.status),
	  parallelWritePolicy: { write_mode: 'parallel' },
	  verificationRollbackDag,
	  fileOwnershipPlan,
	  transactionJournal: { ok: true, blockers: [], event_count: 25 },
	  conflictRebase: { ok: true, blockers: [] }
	});
const report = { schema: 'sks.agent-patch-proof-runtime-check.v1', ok: proof.ok, tmp, queue: queue.toJSON(), merge, applyResults, proof };
writeReport('agent-patch-proof-runtime', report);
assertGate(proof.ok === true, 'patch proof runtime must pass for verified disjoint patches', report);
assertGate(proof.patch_queue_ok === true && proof.patch_apply_ok === true && proof.patch_verification_ok === true && proof.patch_rollback_ok === true, 'patch proof booleans must all pass', report);
assertGate(proof.parallel_patch_apply_verified === true, 'patch proof must record parallel apply group evidence', report);
assertGate(fs.readFileSync(path.join(tmp, 'file-1.txt'), 'utf8') === 'after-1\n', 'patch must be applied to fixture file', report);
emitGate('agent:patch-proof-runtime', { changed_files: proof.changed_files.length });

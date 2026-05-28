import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPatchProof } from '../../dist/core/agents/agent-patch-proof.js';

test('strict patch proof blocks queue entries without strategy wiring', () => {
  const proof = buildAgentPatchProof({
    queue: {
      queued_count: 0,
      entries: [{
        id: 'entry-a',
        status: 'applied',
        lease_id: 'lease-a',
        write_paths: ['a.txt'],
        violations: [],
        envelope: { lease_proof: { lease_id: 'lease-a' } }
      }]
    },
    merge: { ok: true, blockers: [] },
    applyResults: [{ entry_id: 'entry-a', ok: true, changed_files: ['a.txt'], rollback_digest: 'digest-a', verification: { status: 'unit' } }],
    transactionJournal: { ok: true, blockers: [], event_count: 8 },
    conflictRebase: { ok: true, blockers: [] }
  });
  assert.equal(proof.ok, false);
  assert.match(proof.blockers.join('\n'), /strategy_reference_missing|verification_node_missing|rollback_node_missing/);
});

test('strict patch proof accepts strategy, DAG, ownership, journal, and rebase evidence', () => {
  const proof = buildAgentPatchProof({
    queue: {
      queued_count: 0,
      entries: [{
        id: 'entry-a',
        status: 'applied',
        lease_id: 'lease-a',
        write_paths: ['a.txt'],
        violations: [],
        envelope: { lease_proof: { lease_id: 'lease-a', strategy_task_id: 'task-a', owner_agent: 'agent-a', verification_node_id: 'verify-a', rollback_node_id: 'rollback-a' } }
      }]
    },
    merge: { ok: true, blockers: [] },
    applyResults: [{ entry_id: 'entry-a', ok: true, changed_files: ['a.txt'], rollback_digest: 'digest-a', verification: { status: 'unit' } }],
    verificationRollbackDag: { nodes: [{ id: 'verify-a', kind: 'verification' }, { id: 'rollback-a', kind: 'rollback' }] },
    fileOwnershipPlan: { owners: [{ path: 'a.txt', access: 'write', owner_agent: 'agent-a' }] },
    transactionJournal: { ok: true, blockers: [], event_count: 8 },
    conflictRebase: { ok: true, blockers: [] }
  });
  assert.equal(proof.ok, true);
  assert.equal(proof.strategy_to_patch_ok, true);
  assert.equal(proof.verification_node_coverage['entry-a'], 'verify-a');
  assert.equal(proof.rollback_node_coverage['entry-a'], 'rollback-a');
});

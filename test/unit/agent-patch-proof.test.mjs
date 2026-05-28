import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentPatchProof } from '../../dist/core/agents/agent-patch-proof.js';

test('agent patch proof blocks pending or rejected queue entries', () => {
  const proof = buildAgentPatchProof({
    queue: {
      queued_count: 1,
      entries: [{ id: 'entry-1', status: 'pending', violations: [] }]
    },
    merge: { ok: true, blockers: [] },
    applyResults: []
  });
  assert.equal(proof.ok, false);
  assert.match(proof.blockers.join('\n'), /queue_pending_count|queue_entry_not_applied/);
});

test('agent patch proof passes only applied queue entries with rollback digests', () => {
  const proof = buildAgentPatchProof({
    queue: {
      queued_count: 0,
      entries: [{ id: 'entry-1', status: 'applied', violations: [] }],
      events: [{ entry_id: 'entry-1', event_type: 'applied' }]
    },
    merge: { ok: true, blockers: [] },
	    applyResults: [{ ok: true, changed_files: ['a.txt'], rollback_digest: 'digest-a', after_hashes: { 'a.txt': 'hash-a' }, verification: { status: 'unit-fixture' } }],
	    verification: ['unit-fixture'],
	    transactionJournal: { ok: true, blockers: [], event_count: 8 },
	    conflictRebase: { ok: true, blockers: [] }
	  });
  assert.equal(proof.ok, true);
  assert.equal(proof.rollback_ready, true);
});

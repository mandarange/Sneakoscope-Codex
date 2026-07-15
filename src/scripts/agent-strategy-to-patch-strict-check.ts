#!/usr/bin/env node
// @ts-nocheck
import { assertGate, emitGate, importDist } from './sks-1-18-gate-lib.js';
import { writeReport } from './patch-handoff-gate-lib.js';

const proofMod = await importDist('core/agents/agent-patch-proof.js');
const cleanProof = proofMod.buildAgentPatchProof({
  queue: {
    queued_count: 0,
    entries: [{
      id: 'entry-strict',
      status: 'verified',
      violations: [],
      lease_id: 'lease-strict',
      envelope: {
        task_slice_id: 'slice-strict',
        lease_id: 'lease-strict',
        lease_proof: {
          lease_id: 'lease-strict',
          owner_agent: 'agent-strict',
          strategy_task_id: 'task-strict',
          micro_win_id: 'win-strict',
          verification_node_id: 'verify-strict',
          rollback_node_id: 'rollback-strict'
        }
      }
    }],
    events: [{ entry_id: 'entry-strict', event_type: 'verified' }],
    ownership_ledger: [{ entry_id: 'entry-strict', lease_id: 'lease-strict', write_paths: ['strict.txt'] }]
  },
  merge: { ok: true, blockers: [] },
  applyResults: [{ entry_id: 'entry-strict', ok: true, changed_files: ['strict.txt'], rollback_digest: 'digest-strict', verification: { status: 'verified' } }],
  transactionJournal: { ok: true, blockers: [], event_count: 8 },
  conflictRebase: { ok: true, blockers: [] }
});
const missingProof = proofMod.buildAgentPatchProof({
  queue: {
    queued_count: 0,
    entries: [{ id: 'entry-missing', status: 'verified', violations: [], envelope: { lease_proof: {} } }]
  },
  merge: { ok: true, blockers: [] },
  applyResults: [{ entry_id: 'entry-missing', ok: true, changed_files: ['missing.txt'], rollback_digest: 'digest', verification: { status: 'verified' } }],
  transactionJournal: { ok: true, blockers: [], event_count: 8 },
  conflictRebase: { ok: true, blockers: [] }
});
const report = { schema: 'sks.agent-strategy-to-patch-strict-check.v1', ok: cleanProof.ok && missingProof.ok === false, cleanProof, missingProof };
writeReport('agent-strategy-to-patch-strict', report);

assertGate(cleanProof.strategy_to_patch_ok === true, 'strict strategy-to-patch clean fixture must pass', report);
assertGate(cleanProof.verification_node_coverage['entry-strict'] === 'verify-strict', 'verification node coverage must be recorded', report);
assertGate(cleanProof.rollback_node_coverage['entry-strict'] === 'rollback-strict', 'rollback node coverage must be recorded', report);
assertGate(missingProof.blockers.some((row) => row.includes('strategy_reference_missing')), 'missing strategy reference must block proof', report);
assertGate(missingProof.blockers.some((row) => row.includes('verification_node_missing')), 'missing verification node must block proof', report);
assertGate(missingProof.blockers.some((row) => row.includes('rollback_node_missing')), 'missing rollback node must block proof', report);
emitGate('agent:strategy-to-patch-strict', { clean: cleanProof.ok, missing_blockers: missingProof.blockers.length });

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AgentPatchTransactionJournal, summarizeAgentPatchTransactionJournal } from '../../dist/core/agents/agent-patch-transaction-journal.js';

test('patch transaction journal summarizes complete patch lifecycle', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-journal-test-'));
  const journal = new AgentPatchTransactionJournal(dir);
  const base = { entry_id: 'entry-a', agent_id: 'agent-a', lease_id: 'lease-a' };
  for (const event_type of ['enqueue', 'apply_started', 'lock_acquired', 'lock_released']) {
    await journal.append({ ...base, event_type, status: event_type });
  }
  await journal.append({ ...base, event_type: 'apply_finished', status: 'applied', changed_files: ['a.txt'], before_hashes: { 'a.txt': 'before' }, after_hashes: { 'a.txt': 'after' }, rollback_digest: 'rollback-a', verification_status: 'hashes-recorded', duration_ms: 5 });
  await journal.append({ ...base, event_type: 'verification_finished', status: 'verified', changed_files: ['a.txt'], verification_status: 'passed' });
  await journal.append({ ...base, event_type: 'rollback_dry_run_finished', status: 'dry_run', changed_files: ['a.txt'], rollback_digest: 'rollback-a' });
  await journal.append({ ...base, event_type: 'final_status', status: 'verified', changed_files: ['a.txt'] });

  const summary = await summarizeAgentPatchTransactionJournal(dir);
  assert.equal(summary.ok, true);
  assert.equal(summary.entries[0].final_status, 'verified');
  assert.deepEqual(summary.entries[0].changed_files, ['a.txt']);
  assert.equal(summary.entries[0].rollback_digest, 'rollback-a');
});

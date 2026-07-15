import test from 'node:test'
import assert from 'node:assert/strict'
import { leaseComplianceByPatch } from '../agent-proof-evidence.js'

test('agent proof evidence uses canonical patch-proof lease compliance', () => {
  const queueEntries = [{
    id: 'slot-001-0001',
    envelope: {
      agent_id: 'slot-001',
      lease_id: 'write:slot-001:src/a.ts',
      operations: [{ path: 'src/a.ts' }]
    }
  }]
  const initialRosterLeases = [{
    id: 'NW-000001:write:1',
    agent_id: 'naruto_worker_001',
    path: 'src/a.ts'
  }]
  const patchProof = {
    lease_compliance_by_patch: [{
      entry_id: 'slot-001-0001',
      lease_id: 'write:slot-001:src/a.ts',
      ok: true,
      write_paths: ['src/a.ts']
    }]
  }
  assert.deepEqual(leaseComplianceByPatch(queueEntries, initialRosterLeases, patchProof), [{
    patch_entry_id: 'slot-001-0001',
    agent_id: 'slot-001',
    lease_id: 'write:slot-001:src/a.ts',
    ok: true,
    write_paths: ['src/a.ts']
  }])
})

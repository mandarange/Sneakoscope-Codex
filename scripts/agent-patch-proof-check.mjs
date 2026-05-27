#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { assertGate, emitGate, importDist, root } from './sks-1-18-gate-lib.mjs';

const proofMod = await importDist('core/agents/agent-patch-proof.js');
const proof = proofMod.buildAgentPatchProof({
  queue: {
    queued_count: 0,
    entries: [
      { id: 'entry-a', status: 'applied', violations: [] },
      { id: 'entry-b', status: 'applied', violations: [] }
    ],
    events: [
      { entry_id: 'entry-a', event_type: 'applied' },
      { entry_id: 'entry-b', event_type: 'applied' }
    ]
  },
  merge: { ok: true, blockers: [] },
  applyResults: [
    { ok: true, changed_files: ['a.txt'], rollback_digest: 'digest-a' },
    { ok: true, changed_files: ['b.txt'], rollback_digest: 'digest-b' }
  ],
  verification: ['unit-fixture']
});
const pendingProof = proofMod.buildAgentPatchProof({
  queue: { queued_count: 1, entries: [{ id: 'entry-pending', status: 'pending', violations: [] }] },
  merge: { ok: true, blockers: [] },
  applyResults: []
});
const report = { schema: 'sks.agent-patch-proof-check.v1', ok: proof.ok, proof };
const out = path.join(root, '.sneakoscope', 'reports', 'agent-patch-proof.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);

assertGate(proof.ok === true, 'agent patch proof should pass clean apply results', report);
assertGate(proof.rollback_digests.length === 2, 'agent patch proof must preserve rollback digests', report);
assertGate(pendingProof.ok === false, 'agent patch proof must block pending queue entries', { pendingProof });
emitGate('agent:patch-proof', { rollback_digests: proof.rollback_digests.length });

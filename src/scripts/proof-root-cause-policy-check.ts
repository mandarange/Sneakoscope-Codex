import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../core/proof/route-adapter.js';
import { finalizeRouteWithProof } from '../core/proof/route-finalizer.js';
import { validateRouteCompletionProof } from '../core/proof/route-proof-gate.js';
import { buildRouteCompletionContract } from '../core/trust-kernel/route-contract.js';
import { validateCompletionContract } from '../core/trust-kernel/completion-contract.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-root-cause-policy-'));

await writeRouteCompletionProof(root, {
  missionId: 'M-root-cause-missing',
  route: '$Wiki',
  executionClass: 'real',
  status: 'verified_partial',
  unverified: ['fallback path was used without RCA']
});

const missingGate = await validateRouteCompletionProof(root, {
  missionId: 'M-root-cause-missing',
  route: '$Wiki'
});
assert.equal(missingGate.ok, false);
assert.ok(missingGate.issues.includes('root_cause_analysis_missing'));

const fixed = await writeRouteCompletionProof(root, {
  missionId: 'M-root-cause-complete',
  route: '$Wiki',
  executionClass: 'real',
  status: 'verified_partial',
  unverified: ['fallback path was used, root cause corrected below'],
  failureAnalysis: {
    status: 'complete',
    root_cause: 'The fallback branch stayed reachable after route validation issues because completion proof did not require RCA.',
    corrective_action: 'Completion proof and trust contract now require failure analysis before problem-bearing routes can pass.',
    evidence: ['src/core/proof/root-cause-policy.ts', 'src/core/proof/route-proof-gate.ts']
  }
});
const fixedGate = await validateRouteCompletionProof(root, {
  missionId: 'M-root-cause-complete',
  route: '$Wiki'
});
assert.equal(fixedGate.ok, true);

const contract = buildRouteCompletionContract(fixed.proof, { records: [] });
const contractValidation = validateCompletionContract(contract, fixed.proof, { records: [] });
assert.equal(contractValidation.ok, true);

await fs.mkdir(path.join(root, '.sneakoscope', 'missions', 'M-root-cause-finalizer'), { recursive: true });
await fs.writeFile(
  path.join(root, '.sneakoscope', 'missions', 'M-root-cause-finalizer', 'wiki-gate.json'),
  JSON.stringify({ schema_version: 1, ok: true, passed: true }, null, 2)
);
await finalizeRouteWithProof(root, {
  missionId: 'M-root-cause-finalizer',
  route: '$Wiki',
  gateFile: 'wiki-gate.json',
  statusHint: 'verified_partial',
  unverified: ['verified_partial route finalization requires RCA'],
  failureAnalysis: {
    status: 'complete',
    root_cause: 'The route finalizer previously had no explicit pass-through for route-level failure analysis.',
    corrective_action: 'The route finalizer now forwards failureAnalysis to the completion proof writer.',
    evidence: ['src/core/proof/route-finalizer.ts', 'src/core/proof/auto-finalize.ts']
  }
});
const finalizerGate = await validateRouteCompletionProof(root, {
  missionId: 'M-root-cause-finalizer',
  route: '$Wiki'
});
assert.equal(finalizerGate.ok, true);

console.log(JSON.stringify({
  ok: true,
  missing_gate_issues: missingGate.issues,
  fixed_gate_status: fixedGate.status,
  contract_status: contractValidation.status,
  finalizer_gate_status: finalizerGate.status
}));

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { writeRouteCompletionProof } from '../core/proof/route-adapter.js';
import { validateRouteCompletionProof } from '../core/proof/route-proof-gate.js';
import { buildRouteCompletionContract } from '../core/trust-kernel/route-contract.js';
import { validateCompletionContract } from '../core/trust-kernel/completion-contract.js';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'sks-root-cause-policy-'));

await writeRouteCompletionProof(root, {
  missionId: 'M-root-cause-missing',
  route: '$Wiki',
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

console.log(JSON.stringify({
  ok: true,
  missing_gate_issues: missingGate.issues,
  fixed_gate_status: fixedGate.status,
  contract_status: contractValidation.status
}));
